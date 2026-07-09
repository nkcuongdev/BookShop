const config = require("../config");

const DEFAULT_REMOTE_IMAGE_ORIGINS = [
  "https://res.cloudinary.com",
  "https://images.unsplash.com",
  "https://m.media-amazon.com",
  "https://via.placeholder.com",
];

// Extra origins an operator trusts, e.g.
// ALLOWED_IMAGE_ORIGINS=https://cdn.nhanam.vn,https://salt.tikicdn.com
function configuredExtraOrigins() {
  return String(process.env.ALLOWED_IMAGE_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

const ALLOWED_REMOTE_IMAGE_ORIGINS = Object.freeze([
  ...new Set([...DEFAULT_REMOTE_IMAGE_ORIGINS, ...configuredExtraOrigins()]),
]);

function configuredApiOrigin() {
  try {
    return new URL(config.apiPublicUrl).origin;
  } catch {
    return "";
  }
}

function isAllowedBookImageUrl(candidate) {
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  const allowedOrigins = new Set([
    ...ALLOWED_REMOTE_IMAGE_ORIGINS,
    configuredApiOrigin(),
  ]);
  if (allowedOrigins.has(parsed.origin)) return true;
  return (
    process.env.NODE_ENV !== "production" &&
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(parsed.hostname)
  );
}

function cspImageSources() {
  return [...ALLOWED_REMOTE_IMAGE_ORIGINS];
}

module.exports = {
  ALLOWED_REMOTE_IMAGE_ORIGINS,
  cspImageSources,
  isAllowedBookImageUrl,
};
