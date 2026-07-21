const express = require("express");
const { auth } = require("../middleware/auth");
const config = require("../config");
const shippingService = require("../services/shippingService");
const { createRateLimiter } = require("../utils/security");

const router = express.Router();
const quoteLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "shipping-quote",
  message: "Bạn đang kiểm tra phí vận chuyển quá nhanh, vui lòng thử lại sau",
});
const webhookLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyPrefix: "shipping-ghn-webhook",
  message: "Too many shipping webhook requests",
});

router.post("/quotes", quoteLimiter, auth, async (req, res) => {
  try {
    const quotes = await shippingService.getShippingQuotes({
      items: req.body?.items,
      shippingAddress: req.body?.shippingAddress,
    });
    return res.json({
      success: true,
      data: {
        ...quotes,
        integrationEnabled: shippingService.isGhnEnabled(),
        environment: "sandbox",
        simulationEnabled: config.shipping.ghn.simulation.enabled,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.post("/webhooks/ghn", webhookLimiter, async (req, res) => {
  try {
    const verifiedPayload = await shippingService.verifyGhnWebhook(req.body);
    const result = await shippingService.syncGhnWebhook(verifiedPayload);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

module.exports = router;
