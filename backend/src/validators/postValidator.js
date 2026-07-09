const { sanitizeRichText } = require("../utils/security");

const ALLOWED_POST_SORT_FIELDS = new Set([
  "publishedAt",
  "createdAt",
  "viewCount",
]);
const ALLOWED_POST_FIELDS = [
  "title",
  "slug",
  "thumbnail",
  "shortDescription",
  "content",
  "category",
  "status",
  "metaTitle",
  "metaDescription",
  "tags",
];

function normalizePostSort(value, fallback) {
  const field = String(value || "");
  return ALLOWED_POST_SORT_FIELDS.has(field) ? field : fallback;
}

function normalizeQueryValue(value) {
  if (value === undefined || value === null) return undefined;
  if (value === "" || value === "undefined" || value === "null") return undefined;
  return value;
}

function pickPostPayload(body = {}) {
  const payload = {};
  for (const key of ALLOWED_POST_FIELDS) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  if (Array.isArray(payload.tags)) {
    payload.tags = payload.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (["", null, "__none__"].includes(payload.category)) payload.category = null;
  if (typeof payload.title === "string") payload.title = payload.title.trim();
  if (typeof payload.slug === "string") {
    payload.slug = payload.slug.trim().toLowerCase();
  }
  for (const key of ["shortDescription", "metaTitle", "metaDescription"]) {
    if (typeof payload[key] === "string") payload[key] = payload[key].trim();
  }
  if (typeof payload.content === "string") {
    payload.content = sanitizeRichText(payload.content).trim();
  }
  return payload;
}

module.exports = { normalizePostSort, normalizeQueryValue, pickPostPayload };
