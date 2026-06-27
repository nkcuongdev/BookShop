const crypto = require("crypto");
const sanitizeHtml = require("sanitize-html");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { createClient } = require("redis");
const config = require("../config");

let redisClientPromise = null;

function getRedisClient() {
  if (!config.rateLimit.redisUrl) return null;
  if (!redisClientPromise) {
    const client = createClient({ url: config.rateLimit.redisUrl });
    client.on("error", (error) => {
      console.error("Rate-limit Redis error:", error.message);
    });
    redisClientPromise = client.connect().then(() => client);
  }
  return redisClientPromise;
}

function normalizedIp(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");
}

function hashRateLimitPart(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 24);
}

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

function sanitizeRichText(value = "") {
  return sanitizeHtml(String(value), {
    allowedTags: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "blockquote",
      "code",
      "pre",
      "a",
      "img",
      "figure",
      "figcaption",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          ...(attribs.target === "_blank"
            ? { rel: "noopener noreferrer" }
            : {}),
        },
      }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: { ...attribs, loading: attribs.loading || "lazy" },
      }),
    },
  });
}

function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyPrefix = "default",
  message = "Too many requests, please try again later",
  keyGenerator,
  skipSuccessfulRequests = false,
} = {}) {
  const redis = getRedisClient();
  const store = redis
    ? new RedisStore({
        prefix: `bookshop:rate-limit:${keyPrefix}:`,
        sendCommand: async (...args) => (await redis).sendCommand(args),
      })
    : undefined;

  return rateLimit({
    windowMs,
    limit: max,
    store,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests,
    passOnStoreError: false,
    keyGenerator: keyGenerator || normalizedIp,
    handler: (_req, res) => res.status(429).json({ success: false, message }),
  });
}

module.exports = {
  escapeRegex,
  safeRegex,
  parsePositiveInt,
  createRateLimiter,
  normalizedIp,
  hashRateLimitPart,
  sanitizeRichText,
  getRedisClient,
};
