const mongoose = require("mongoose");
const config = require("../config");
const {
  processAbandonedCarts,
} = require("../services/cartReminderService");

const INTERVAL_MS = 15 * 60_000;

let timer = null;
let running = false;
let app = null;

/**
 * Nudge shoppers whose cart has sat untouched past the configured idle window.
 *
 * The service owns the throttling: one delivery row per (user, cart contents,
 * stage) means a shopper is reminded at most twice for a given cart, and the
 * cycle restarts only when they actually change what is in it.
 */
async function tick(now = new Date()) {
  if (running || !config.cartReminder.enabled) return null;
  if (mongoose.connection.readyState !== 1) return null;
  running = true;
  try {
    const summary = await processAbandonedCarts(app, now);
    if (summary.failed) {
      console.warn(
        `[cartReminders] ${summary.failed}/${summary.scanned} reminders failed and will retry`
      );
    }
    return summary;
  } catch (error) {
    console.error("[cartReminders] Tick error:", error.message);
    return null;
  } finally {
    running = false;
  }
}

function start(expressApp) {
  if (timer || !config.cartReminder.enabled) return;
  app = expressApp;
  void tick();
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  app = null;
}

module.exports = { INTERVAL_MS, start, stop, tick };
