const { autoResolveStaleTickets } = require("../services/supportResolutionService");

let timer = null;
let running = false;

async function tick() {
  if (running) return { scanned: 0, resolved: 0 };
  running = true;
  try {
    return await autoResolveStaleTickets();
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  // Abandoned tickets are measured in days, so an hourly sweep is plenty.
  timer = setInterval(() => void tick(), 60 * 60_000);
  timer.unref?.();
  void tick();
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
