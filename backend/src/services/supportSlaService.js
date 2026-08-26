const config = require("../config");

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

function policy() {
  const {
    businessHoursEnabled,
    businessHourStart,
    businessHourEnd,
    businessDays,
    timezone,
  } = config.support;
  // A start at/after the end would make every day zero-length and loop forever.
  const validWindow = businessHourEnd > businessHourStart;
  return {
    enabled: businessHoursEnabled && validWindow && businessDays.length > 0,
    start: businessHourStart,
    end: businessHourEnd,
    days: new Set(businessDays),
    timezone,
  };
}

const partsFormatter = new Map();

function formatterFor(timezone) {
  if (!partsFormatter.has(timezone)) {
    partsFormatter.set(
      timezone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour12: false,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }
  return partsFormatter.get(timezone);
}

const WEEKDAY_TO_ISO = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

// Reads the wall-clock weekday/hour/minute of an instant in the support
// timezone, so deadlines follow local business hours regardless of server TZ.
function localParts(date, timezone) {
  const parts = formatterFor(timezone).formatToParts(date);
  const lookup = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  const hour = Number.parseInt(lookup.hour, 10) % 24;
  return {
    isoDay: WEEKDAY_TO_ISO[lookup.weekday] || 1,
    minutesOfDay: hour * 60 + Number.parseInt(lookup.minute, 10),
  };
}

/**
 * Adds `minutes` of *business* time to `from`, skipping closed hours and
 * non-working days. Falls back to plain elapsed time when business hours are
 * disabled or misconfigured.
 */
function addBusinessMinutes(from, minutes, now = from) {
  const rules = policy();
  const budget = Math.max(0, Number(minutes) || 0);
  if (!rules.enabled) return new Date(now.getTime() + budget * MINUTE_MS);

  const openStart = rules.start * 60;
  const openEnd = rules.end * 60;
  const dailyCapacity = openEnd - openStart;

  let cursor = new Date(now.getTime());
  let remaining = budget;
  // Each iteration consumes at most one business day, so the loop is bounded by
  // the budget plus the closed-day skips needed to reach the next open window.
  let guard = 0;
  const maxIterations = Math.ceil(budget / dailyCapacity) + 14;

  while (remaining > 0 && guard < maxIterations) {
    guard += 1;
    const { isoDay, minutesOfDay } = localParts(cursor, rules.timezone);

    if (!rules.days.has(isoDay)) {
      // Jump to the start of the next calendar day and re-evaluate.
      cursor = new Date(
        cursor.getTime() + (DAY_MINUTES - minutesOfDay) * MINUTE_MS
      );
      continue;
    }
    if (minutesOfDay < openStart) {
      cursor = new Date(cursor.getTime() + (openStart - minutesOfDay) * MINUTE_MS);
      continue;
    }
    if (minutesOfDay >= openEnd) {
      cursor = new Date(
        cursor.getTime() + (DAY_MINUTES - minutesOfDay) * MINUTE_MS
      );
      continue;
    }

    const availableToday = openEnd - minutesOfDay;
    if (remaining <= availableToday) {
      return new Date(cursor.getTime() + remaining * MINUTE_MS);
    }
    remaining -= availableToday;
    cursor = new Date(cursor.getTime() + availableToday * MINUTE_MS);
  }

  return remaining > 0
    ? new Date(cursor.getTime() + remaining * MINUTE_MS)
    : cursor;
}

/**
 * Business-time deadlines for a ticket priority, measured from `origin`.
 */
function slaDeadlines(priority, origin = new Date(), slaTable) {
  const table = slaTable || require("../models/SupportTicket").SLA_MINUTES;
  const rules = table[priority] || table.NORMAL;
  const from = new Date(origin);
  return {
    responseDueAt: addBusinessMinutes(from, rules.response, from),
    resolutionDueAt: addBusinessMinutes(from, rules.resolution, from),
  };
}

module.exports = { addBusinessMinutes, slaDeadlines };
