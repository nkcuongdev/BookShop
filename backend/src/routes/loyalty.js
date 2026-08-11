const express = require("express");
const loyaltyService = require("../services/loyaltyService");
const { auth } = require("../middleware/auth");
const { createRateLimiter, parsePositiveInt } = require("../utils/security");

const router = express.Router();

const redeemLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "loyalty-redeem-gift",
  message: "Too many redemptions, please try again later",
});

const previewLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyPrefix: "loyalty-preview",
  message: "Too many point previews, please try again later",
});

// GET /api/loyalty/me - balance, tier and where the next rung sits
router.get("/me", auth, async (req, res) => {
  try {
    const summary = await loyaltyService.getSummary(req.user._id);
    // Personal balance: never let a shared cache hold on to it.
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Lỗi server",
    });
  }
});

// GET /api/loyalty/history - paged points ledger for the signed-in customer
router.get("/history", auth, async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 50);
    const result = await loyaltyService.getHistory(
      req.user._id,
      {
        type: String(req.query.type || "").trim(),
        from: req.query.from,
        to: req.query.to,
      },
      { page, limit }
    );
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Lỗi server",
      data: { entries: [], pagination: null },
    });
  }
});

// POST /api/loyalty/preview-redeem - how many points this basket can absorb
router.post("/preview-redeem", previewLimiter, auth, async (req, res) => {
  try {
    const { subtotal = 0, discountAmount = 0 } = req.body || {};
    const preview = await loyaltyService.previewRedeem({
      userId: req.user._id,
      subtotal: Number(subtotal) || 0,
      discountAmount: Number(discountAmount) || 0,
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: preview });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Lỗi server",
    });
  }
});

// GET /api/loyalty/gifts - reward catalogue, with affordability resolved
router.get("/gifts", auth, async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 50);
    const result = await loyaltyService.listGifts({
      userId: req.user._id,
      page,
      limit,
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Lỗi server",
      data: { gifts: [], pagination: null },
    });
  }
});

// POST /api/loyalty/gifts/:id/redeem - trade points for a personal voucher
router.post("/gifts/:id/redeem", redeemLimiter, auth, async (req, res) => {
  try {
    const { gift, voucher, redemption } = await loyaltyService.redeemGift({
      userId: req.user._id,
      giftId: req.params.id,
    });
    res.status(201).json({
      success: true,
      message: "Đổi quà thành công",
      data: {
        giftName: gift.name,
        pointsSpent: redemption.pointsSpent,
        voucher: {
          code: voucher.code,
          type: voucher.type,
          scope: voucher.scope,
          value: voucher.value,
          minOrder: voucher.minOrder,
          maxDiscount: voucher.maxDiscount,
          endAt: voucher.endAt,
        },
      },
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Không đổi được quà",
      code: error.code,
    });
  }
});

// GET /api/loyalty/my-gifts - vouchers already traded for
router.get("/my-gifts", auth, async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 50);
    const result = await loyaltyService.listMyRedemptions(req.user._id, {
      status: String(req.query.status || "").trim(),
      page,
      limit,
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Lỗi server",
      data: { redemptions: [], pagination: null },
    });
  }
});

module.exports = router;
