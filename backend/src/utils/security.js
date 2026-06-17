function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeRegex(value = "", flags = "i", maxLength = 80) {
  const trimmed = String(value || "").trim().slice(0, maxLength);
  if (!trimmed) return null;
  return new RegExp(escapeRegex(trimmed), flags);
}

function parsePositiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyPrefix = "default",
  message = "Too many requests, please try again later",
} = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    const now = Date.now();
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      return res.status(429).json({ success: false, message });
    }

    return next();
  };
}

module.exports = {
  escapeRegex,
  safeRegex,
  parsePositiveInt,
  createRateLimiter,
};
