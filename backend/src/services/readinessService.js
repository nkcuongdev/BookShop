const mongoose = require("mongoose");
const { getRedisClient } = require("../utils/security");
const { verifyEmailTransport } = require("./emailService");
const { verifyImageStorage } = require("./imageStorage");

const CACHE_MS = 15_000;
const CHECK_TIMEOUT_MS = 5_000;
let cached = null;

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} readiness check timed out`)),
        CHECK_TIMEOUT_MS
      );
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

async function runCheck(name, work, { optional = false } = {}) {
  try {
    const result = await withTimeout(work(), name);
    const disabled = result?.enabled === false;
    return {
      status: disabled ? "disabled" : result?.healthy === false ? "down" : "up",
      healthy: optional ? true : result?.healthy !== false,
    };
  } catch {
    return { status: "down", healthy: optional };
  }
}

async function checkReadiness({ bypassCache = false } = {}) {
  if (!bypassCache && cached?.expiresAt > Date.now()) return cached.value;
  const optionalOutsideProduction = process.env.NODE_ENV !== "production";
  const [mongo, redis, mail, upload] = await Promise.all([
    runCheck("mongo", async () => ({
      healthy: mongoose.connection.readyState === 1,
    })),
    runCheck(
      "redis",
      async () => {
        const clientPromise = getRedisClient();
        if (!clientPromise) return { enabled: false, healthy: false };
        const client = await clientPromise;
        return { enabled: true, healthy: (await client.ping()) === "PONG" };
      },
      { optional: optionalOutsideProduction }
    ),
    // Mail health is reported but does not make the storefront unavailable.
    runCheck("mail", verifyEmailTransport, { optional: true }),
    runCheck("upload", verifyImageStorage, {
      optional: optionalOutsideProduction,
    }),
  ]);
  const checks = { mongo, redis, mail, upload };
  const value = {
    ready: Object.values(checks).every((check) => check.healthy),
    checks: Object.fromEntries(
      Object.entries(checks).map(([name, check]) => [name, check.status])
    ),
    timestamp: new Date().toISOString(),
  };
  cached = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

function clearReadinessCache() {
  cached = null;
}

module.exports = { checkReadiness, clearReadinessCache };
