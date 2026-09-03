const AnalyticsEvent = require("../models/AnalyticsEvent");

const FUNNEL_TYPES = [
  ["product_view", "Lượt xem"],
  ["add_to_cart", "Thêm giỏ"],
  ["checkout_start", "Bắt đầu checkout"],
  ["order_created", "Tạo đơn"],
  ["payment_success", "Thanh toán thành công"],
];

function parseDays(value, fallback = 30) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(1, Math.min(365, Number.isFinite(parsed) ? parsed : fallback));
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function shiftCalendarDate(parts, days) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localMidnightToUtc(parts, timeZone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = zonedParts(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second
    );
    candidate = target - (representedAsUtc - candidate);
  }
  return new Date(candidate);
}

function formatDateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function getZonedDateWindow(days, now, timeZone) {
  const today = zonedParts(now, timeZone);
  const startDay = shiftCalendarDate(today, -(days - 1));
  const endDay = shiftCalendarDate(today, 1);
  const calendarDays = Array.from({ length: days }, (_, index) => {
    const day = shiftCalendarDate(startDay, index);
    return {
      key: formatDateKey(day),
      label: `${String(day.day).padStart(2, "0")}/${String(day.month).padStart(
        2,
        "0"
      )}`,
    };
  });
  return {
    start: localMidnightToUtc(startDay, timeZone),
    endExclusive: localMidnightToUtc(endDay, timeZone),
    calendarDays,
  };
}

async function getFunnelStages(days, now = new Date()) {
  const since = new Date(now.getTime() - parseDays(days) * 24 * 60 * 60 * 1000);
  const rows = await AnalyticsEvent.aggregate([
    {
      $match: {
        createdAt: { $gte: since, $lte: now },
        type: { $in: FUNNEL_TYPES.map(([type]) => type) },
      },
    },
    {
      $set: {
        identity: {
          $cond: [
            { $ne: ["$user", null] },
            { $concat: ["user:", { $toString: "$user" }] },
            {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ["$sessionId", ""] } }, 0] },
                { $concat: ["session:", "$sessionId"] },
                { $concat: ["event:", { $toString: "$_id" }] },
              ],
            },
          ],
        },
      },
    },
    { $group: { _id: { type: "$type", identity: "$identity" } } },
    { $group: { _id: "$_id.type", value: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(rows.map((row) => [row._id, row.value]));
  return FUNNEL_TYPES.map(([type, stage]) => ({ stage, value: counts[type] || 0 }));
}

module.exports = {
  getFunnelStages,
  getZonedDateWindow,
  parseDays,
};
