const express = require("express");
const orderService = require("../services/orderService");
const {
  getAvailablePublicVouchers,
} = require("../services/voucherReservationService");
const { optionalAuth } = require("../middleware/auth");
const { createRateLimiter } = require("../utils/security");

const router = express.Router();
const validateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "voucher-validate",
  message: "Too many voucher checks, please try again later",
});
const availableLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyPrefix: "voucher-available",
  message: "Too many voucher list requests, please try again later",
});

router.get("/available", availableLimiter, optionalAuth, async (req, res) => {
  try {
    const vouchers = await getAvailablePublicVouchers(req.query.subtotal ?? 0, {
      userId: req.user?._id || null,
      shippingFee: req.query.shippingFee ?? 0,
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { vouchers } });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: status === 500 ? "Lỗi server" : error.message,
      data: { vouchers: [] },
    });
  }
});

router.post("/validate", validateLimiter, optionalAuth, async (req, res) => {
  try {
    const { code, subtotal = 0, shippingFee } = req.body || {};
    const result = await orderService.applyVoucher(code, Number(subtotal) || 0, {
      userId: req.user?._id || null,
      shippingFee: Number(shippingFee) || 0,
      allowPendingShipping:
        shippingFee === undefined || shippingFee === null,
    });
    res.json({
      success: true,
      data: {
        valid: true,
        discountAmount: result.discountAmount,
        voucher: result.voucher
          ? {
              code: result.voucher.code,
              type: result.voucher.type,
              scope: result.voucher.scope,
              value: result.voucher.value,
              discountAmount: result.voucher.discountAmount,
            }
          : null,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
      data: { valid: false, discountAmount: 0, voucher: null },
    });
  }
});

module.exports = router;
