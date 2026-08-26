const NOTIFICATION_TYPES = Object.freeze([
  "order",
  "payment",
  "shipping",
  "refund",
  "chat",
  "stock",
  "promotion",
  "review",
  "loyalty",
  "system",
]);

const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  inApp: Object.freeze(
    Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, true]))
  ),
  email: Object.freeze(
    Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [
        type,
        ["order", "payment", "shipping", "refund"].includes(type),
      ])
    )
  ),
});

function normalizeNotificationPreferences(value = {}) {
  return {
    inApp: Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [
        type,
        typeof value?.inApp?.[type] === "boolean"
          ? value.inApp[type]
          : DEFAULT_NOTIFICATION_PREFERENCES.inApp[type],
      ])
    ),
    email: Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [
        type,
        typeof value?.email?.[type] === "boolean"
          ? value.email[type]
          : DEFAULT_NOTIFICATION_PREFERENCES.email[type],
      ])
    ),
  };
}

function mergeNotificationPreferences(current, patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    const error = new Error("Tùy chọn thông báo không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  const next = normalizeNotificationPreferences(current);
  for (const channel of ["inApp", "email"]) {
    if (patch[channel] === undefined) continue;
    if (
      !patch[channel] ||
      typeof patch[channel] !== "object" ||
      Array.isArray(patch[channel])
    ) {
      const error = new Error("Kênh thông báo không hợp lệ");
      error.statusCode = 400;
      throw error;
    }
    for (const [type, enabled] of Object.entries(patch[channel])) {
      if (!NOTIFICATION_TYPES.includes(type) || typeof enabled !== "boolean") {
        const error = new Error("Tùy chọn thông báo không hợp lệ");
        error.statusCode = 400;
        throw error;
      }
      next[channel][type] = enabled;
    }
  }
  return next;
}

module.exports = {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TYPES,
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
};
