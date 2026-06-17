const express = require("express");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { optionalAuth, auth, adminOnly } = require("../middleware/auth");
const { createRateLimiter } = require("../utils/security");

const router = express.Router();
const eventLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  keyPrefix: "analytics-event",
  message: "Too many events",
});

router.post("/", eventLimiter, optionalAuth, async (req, res) => {
  try {
    const { type, bookId, orderId, value = 0, sessionId = "", metadata = null } = req.body || {};
    if (!type) return res.status(400).json({ success: false, message: "Missing event type" });
    const safeMetadata =
      metadata && JSON.stringify(metadata).length <= 2000 ? metadata : null;
    const event = await AnalyticsEvent.create({
      user: req.user?._id || null,
      sessionId: String(sessionId || ""),
      type,
      book: bookId || null,
      order: orderId || null,
      value: Number(value) || 0,
      metadata: safeMetadata,
    });
    res.status(201).json({ success: true, data: { eventId: event._id } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/funnel", auth, adminOnly, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$type", value: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(rows.map((row) => [row._id, row.value]));
    const stages = [
      { stage: "Luot xem", value: counts.product_view || 0 },
      { stage: "Them gio", value: counts.add_to_cart || 0 },
      { stage: "Bat dau checkout", value: counts.checkout_start || 0 },
      { stage: "Tao don", value: counts.order_created || 0 },
      { stage: "Thanh toan thanh cong", value: counts.payment_success || 0 },
    ];
    res.json({ success: true, data: { stages } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
