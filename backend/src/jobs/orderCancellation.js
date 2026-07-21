const orderCancellationService = require("../services/orderCancellationService");

let timer = null;
let running = false;

async function tick() {
  if (running) return { processed: 0, completed: 0, failed: 0 };
  running = true;
  try {
    return await orderCancellationService.processPending();
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(() => void tick(), 5_000);
  timer.unref?.();
  void tick();
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
