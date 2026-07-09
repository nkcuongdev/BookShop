const { cleanupOneDueAsset } = require("../services/assetLifecycleService");

const INTERVAL_MS = 60_000;
const MAX_PER_TICK = 20;
let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    for (let index = 0; index < MAX_PER_TICK; index += 1) {
      if (!(await cleanupOneDueAsset())) break;
    }
  } catch (error) {
    console.error("Asset cleanup failed:", error.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  void tick();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
