const mongoose = require("mongoose");
const Promotion = require("../models/Promotion");
const {
  processPromotionWishlistAlerts,
} = require("../services/promotionAlertService");

const INTERVAL_MS = 60_000;
const MAX_PROMOTIONS_PER_TICK = 20;
let timer = null;
let running = false;
let app = null;

async function tick(now = new Date()) {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const promotions = await Promotion.find({
      active: true,
      wishlistAlertProcessedAt: null,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .sort({ startDate: 1, _id: 1 })
      .limit(MAX_PROMOTIONS_PER_TICK);
    for (const promotion of promotions) {
      await processPromotionWishlistAlerts(promotion, app, now);
    }
  } catch (error) {
    console.error("[promotionAlerts] Tick error:", error.message);
  } finally {
    running = false;
  }
}

function start(expressApp) {
  if (timer) return;
  app = expressApp;
  void tick();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  app = null;
}

module.exports = { start, stop, tick };
