const config = require("../config");
const shippingService = require("../services/shippingService");

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await shippingService.processDueSandboxSimulations();
    if (result.failed > 0) {
      console.warn(
        `[shipping-sandbox] ${result.failed} bước mô phỏng chưa xử lý được`
      );
    }
  } catch (error) {
    console.error("[shipping-sandbox] Worker error:", error.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer || !config.shipping.ghn.simulation.enabled) return;
  const intervalMs = Math.max(
    1_000,
    Math.min(2_000, config.shipping.ghn.simulation.stepDelayMs)
  );
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  void tick();
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
