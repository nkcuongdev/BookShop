process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { addBusinessMinutes, slaDeadlines } = require("../src/services/supportSlaService");

const TZ = "Asia/Ho_Chi_Minh";

/** Wall-clock hour/weekday in the support timezone, for readable assertions. */
function localParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const lookup = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  return {
    weekday: lookup.weekday,
    hour: Number.parseInt(lookup.hour, 10) % 24,
    minute: Number.parseInt(lookup.minute, 10),
  };
}

/** 2026-08-31 is a Monday. Times are given in Asia/Ho_Chi_Minh (UTC+7). */
function vnTime(day, hour, minute = 0) {
  return new Date(Date.UTC(2026, 7, day, hour - 7, minute));
}

function withBusinessHours(overrides, run) {
  const original = { ...config.support };
  Object.assign(config.support, overrides);
  try {
    return run();
  } finally {
    Object.assign(config.support, original);
  }
}

test("a mid-morning ticket keeps its deadline inside the same working day", () => {
  withBusinessHours(
    {
      businessHoursEnabled: true,
      businessHourStart: 8,
      businessHourEnd: 21,
      businessDays: [1, 2, 3, 4, 5, 6],
      timezone: TZ,
    },
    () => {
      // Monday 09:00 + 4 business hours = Monday 13:00.
      const due = addBusinessMinutes(vnTime(31, 9), 4 * 60);
      const parts = localParts(due);
      assert.equal(parts.weekday, "Mon");
      assert.equal(parts.hour, 13);
      assert.equal(parts.minute, 0);
    }
  );
});

test("an out-of-hours ticket starts its clock at the next opening, not overnight", () => {
  withBusinessHours(
    {
      businessHoursEnabled: true,
      businessHourStart: 8,
      businessHourEnd: 21,
      businessDays: [1, 2, 3, 4, 5, 6],
      timezone: TZ,
    },
    () => {
      // Saturday 22:00 + 4 business hours. Sunday is closed, so the clock
      // resumes Monday 08:00 and the deadline lands at Monday 12:00 -- never
      // in the middle of Sunday night when nobody is working.
      const due = addBusinessMinutes(vnTime(29, 22), 4 * 60);
      const parts = localParts(due);
      assert.equal(parts.weekday, "Mon");
      assert.equal(parts.hour, 12);
      assert.ok(due.getTime() > vnTime(29, 22).getTime());
    }
  );
});

test("a deadline that overflows one day continues on the next working day", () => {
  withBusinessHours(
    {
      businessHoursEnabled: true,
      businessHourStart: 8,
      businessHourEnd: 21,
      businessDays: [1, 2, 3, 4, 5, 6],
      timezone: TZ,
    },
    () => {
      // Monday 20:00 + 3 business hours: 1 hour left on Monday, the remaining
      // 2 hours run from Tuesday 08:00 to Tuesday 10:00.
      const due = addBusinessMinutes(vnTime(31, 20), 3 * 60);
      const parts = localParts(due);
      assert.equal(parts.weekday, "Tue");
      assert.equal(parts.hour, 10);
    }
  );
});

test("Sunday is skipped entirely when it is not a working day", () => {
  withBusinessHours(
    {
      businessHoursEnabled: true,
      businessHourStart: 8,
      businessHourEnd: 21,
      businessDays: [1, 2, 3, 4, 5, 6],
      timezone: TZ,
    },
    () => {
      // Saturday 20:00 + 2 business hours: 1 hour on Saturday, then Monday.
      const due = addBusinessMinutes(vnTime(29, 20), 2 * 60);
      assert.equal(localParts(due).weekday, "Mon");
      assert.equal(localParts(due).hour, 9);
    }
  );
});

test("a 24/7 desk falls back to plain elapsed time", () => {
  withBusinessHours({ businessHoursEnabled: false }, () => {
    const from = vnTime(29, 22);
    const due = addBusinessMinutes(from, 4 * 60);
    assert.equal(due.getTime() - from.getTime(), 4 * 60 * 60 * 1000);
  });
});

test("an invalid business window degrades to elapsed time instead of hanging", () => {
  withBusinessHours(
    {
      businessHoursEnabled: true,
      // An end at or before the start would give every day zero capacity.
      businessHourStart: 20,
      businessHourEnd: 8,
      businessDays: [1, 2, 3, 4, 5, 6],
      timezone: TZ,
    },
    () => {
      const from = vnTime(31, 9);
      const due = addBusinessMinutes(from, 120);
      assert.equal(due.getTime() - from.getTime(), 120 * 60 * 1000);
    }
  );
});

test("an empty working-week configuration degrades to elapsed time", () => {
  withBusinessHours(
    {
      businessHoursEnabled: true,
      businessHourStart: 8,
      businessHourEnd: 21,
      businessDays: [],
      timezone: TZ,
    },
    () => {
      const from = vnTime(31, 9);
      const due = addBusinessMinutes(from, 60);
      assert.equal(due.getTime() - from.getTime(), 60 * 60 * 1000);
    }
  );
});

test("priority deadlines stay ordered and land inside working hours", () => {
  withBusinessHours(
    {
      businessHoursEnabled: true,
      businessHourStart: 8,
      businessHourEnd: 21,
      businessDays: [1, 2, 3, 4, 5, 6],
      timezone: TZ,
    },
    () => {
      const origin = vnTime(31, 9);
      const urgent = slaDeadlines("URGENT", origin);
      const normal = slaDeadlines("NORMAL", origin);
      const low = slaDeadlines("LOW", origin);

      assert.ok(urgent.responseDueAt < normal.responseDueAt);
      assert.ok(normal.responseDueAt < low.responseDueAt);
      assert.ok(urgent.resolutionDueAt < normal.resolutionDueAt);
      assert.ok(normal.resolutionDueAt < low.resolutionDueAt);

      for (const deadline of [
        urgent.responseDueAt,
        normal.responseDueAt,
        low.responseDueAt,
        urgent.resolutionDueAt,
        normal.resolutionDueAt,
        low.resolutionDueAt,
      ]) {
        const parts = localParts(deadline);
        assert.notEqual(parts.weekday, "Sun", "no deadline may fall on a closed day");
        assert.ok(
          parts.hour >= 8 && parts.hour <= 21,
          `deadline fell outside working hours at ${parts.hour}:00`
        );
      }
    }
  );
});

test("an unknown priority falls back to the NORMAL policy", () => {
  const origin = vnTime(31, 9);
  const unknown = slaDeadlines("NOT_A_PRIORITY", origin);
  const normal = slaDeadlines("NORMAL", origin);
  assert.equal(unknown.responseDueAt.getTime(), normal.responseDueAt.getTime());
});
