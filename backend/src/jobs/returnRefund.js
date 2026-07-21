const {
  processPendingReturnRefunds,
  reconcileProcessingRefunds,
} = require("../services/returnRequestService");
const supportResolutionService = require("../services/supportResolutionService");

let timer = null;
let running = false;

const INTERVAL_MS = 30_000;

/**
 * Two passes over money owed to customers, in order:
 *
 *  1. Refunds not yet sent to the gateway, or sent and rejected  -> retry.
 *  2. Refunds the gateway accepted but has not settled           -> ask.
 *
 * The second pass is what closes the loop on VNPay, which answers "accepted"
 * long before the money moves. Without it those refunds sit waiting forever
 * because nothing else can tell when they land.
 *
 * Each pass is independent: a throwing reconciliation must not stop the retry
 * queue, and vice versa, or one bad record could stall every refund.
 */
async function tick() {
  if (running) {
    return { processed: 0, completed: 0, reconciled: null };
  }
  running = true;
  try {
    let retried = { processed: 0, completed: 0 };
    try {
      retried = await processPendingReturnRefunds();
    } catch (error) {
      console.error("[returnRefund] retry pass failed:", error.message);
    }

    let returns = null;
    try {
      returns = await reconcileProcessingRefunds();
    } catch (error) {
      console.error("[returnRefund] return reconciliation failed:", error.message);
    }

    let tickets = null;
    try {
      tickets = await supportResolutionService.reconcileProcessingRefunds();
    } catch (error) {
      console.error("[returnRefund] ticket reconciliation failed:", error.message);
    }

    if (returns?.settled || tickets?.settled) {
      console.log(
        `[returnRefund] settled ${returns?.settled || 0} return(s) and ${
          tickets?.settled || 0
        } ticket(s) confirmed by the gateway`
      );
    }
    return { ...retried, reconciled: { returns, tickets } };
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref?.();
  // Run once on boot rather than waiting out the first interval. On hosts that
  // idle the service (Render's free tier sleeps after ~15 minutes), this is the
  // pass that catches refunds which settled while nothing was running.
  void tick();
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { INTERVAL_MS, start, stop, tick };
