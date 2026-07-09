const crypto = require("node:crypto");
const Post = require("../models/Post");

const VIEW_DEDUPE_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5_000;
const seen = new Map();
const pending = new Map();
let timer = null;

function fingerprint(req) {
  return crypto
    .createHash("sha256")
    .update(`${req.ip || ""}|${String(req.get("user-agent") || "").slice(0, 300)}`)
    .digest("hex");
}

async function flush() {
  if (!pending.size) return 0;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    await Post.bulkWrite(
      batch.map(([postId, count]) => ({
        updateOne: { filter: { _id: postId }, update: { $inc: { viewCount: count } } },
      })),
      { ordered: false }
    );
    return batch.length;
  } catch (error) {
    for (const [postId, count] of batch) {
      pending.set(postId, (pending.get(postId) || 0) + count);
    }
    throw error;
  }
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush().catch((error) => console.error("[post-views] flush failed:", error.message));
  }, FLUSH_INTERVAL_MS);
  timer.unref?.();
}

function record(postId, req, now = Date.now()) {
  const key = `${postId}:${fingerprint(req)}`;
  const expiresAt = seen.get(key) || 0;
  if (expiresAt > now) return false;
  seen.set(key, now + VIEW_DEDUPE_MS);
  pending.set(String(postId), (pending.get(String(postId)) || 0) + 1);
  if (seen.size > 10_000) {
    for (const [seenKey, expiry] of seen) {
      if (expiry <= now) seen.delete(seenKey);
    }
  }
  scheduleFlush();
  return true;
}

module.exports = { flush, record };
