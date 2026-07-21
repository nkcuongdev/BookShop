const mongoose = require("mongoose");

const AFTER_COMMIT = Symbol("afterCommitCallbacks");

function afterCommit(session, callback) {
  if (!session || typeof callback !== "function") return false;
  if (!Array.isArray(session[AFTER_COMMIT])) session[AFTER_COMMIT] = [];
  session[AFTER_COMMIT].push(callback);
  return true;
}

async function runInTransaction(work, options = {}) {
  const session = await mongoose.startSession();
  try {
    let callbacks = [];
    const result = await session.withTransaction(async () => {
      // withTransaction may retry the body. Only callbacks registered by the
      // attempt that actually commits are allowed to escape.
      session[AFTER_COMMIT] = [];
      const value = await work(session);
      callbacks = [...session[AFTER_COMMIT]];
      return value;
    }, options);
    await Promise.allSettled(callbacks.map((callback) => callback()));
    return result;
  } finally {
    delete session[AFTER_COMMIT];
    await session.endSession();
  }
}

module.exports = { afterCommit, runInTransaction };
