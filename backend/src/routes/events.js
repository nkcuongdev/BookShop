const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { optionalAuth, auth, requirePermission } = require("../middleware/auth");
const {
  createRateLimiter,
  hashRateLimitPart,
} = require("../utils/security");
const { getFunnelStages } = require("../services/analyticsService");

const router = express.Router();
const CLIENT_EVENT_TYPES = new Set([
  "product_view",
  "search",
  "add_to_cart",
  "cart_update",
  "checkout_start",
]);
const eventIpLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  keyPrefix: "analytics-event-ip",
  message: "Too many events",
});
const eventSessionLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  keyPrefix: "analytics-event-session",
  message: "Too many events",
  keyGenerator: (req) =>
    hashRateLimitPart(req.body?.sessionId || "missing-session"),
});

router.post("/", eventIpLimiter, eventSessionLimiter, optionalAuth, async (req, res) => {
  try {
    const { type, bookId, sessionId = "", metadata = null } = req.body || {};
    const normalizedType = String(type || "").trim();
    if (!CLIENT_EVENT_TYPES.has(normalizedType)) {
      return res.status(400).json({ success: false, message: "Unsupported client event type" });
    }
    const normalizedSessionId = String(sessionId || "").trim();
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(normalizedSessionId)) {
      return res.status(400).json({ success: false, message: "Invalid analytics session" });
    }
    const requiresBook = ["product_view", "add_to_cart", "cart_update"].includes(
      normalizedType
    );
    if (requiresBook && !mongoose.isValidObjectId(bookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID" });
    }
    const safeMetadata =
      metadata && typeof metadata === "object" && JSON.stringify(metadata).length <= 2000
        ? metadata
        : null;
    const bucket = Math.floor(Date.now() / 10_000);
    const identity = req.user?._id || normalizedSessionId;
    const dedupeKey = crypto
      .createHash("sha256")
      .update(`${identity}|${normalizedType}|${bookId || ""}|${bucket}`)
      .digest("hex");
    const result = await AnalyticsEvent.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          user: req.user?._id || null,
          sessionId: normalizedSessionId,
          type: normalizedType,
          book: bookId || null,
          order: null,
          value: 0,
          metadata: safeMetadata,
          dedupeKey,
        },
      },
      { upsert: true }
    );
    res.status(result.upsertedCount ? 201 : 202).json({
      success: true,
      data: { deduplicated: result.upsertedCount === 0 },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/funnel", auth, requirePermission("analytics.view"), async (req, res) => {
  try {
    const stages = await getFunnelStages(req.query.days);
    res.json({ success: true, data: { stages } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
