const express = require("express");
const orderService = require("../services/orderService");
const { createRateLimiter } = require("../utils/security");

const router = express.Router();
const validateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "voucher-validate",
  message: "Too many voucher checks, please try again later",
});

router.post("/validate", validateLimiter, async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body || {};
    const result = await orderService.applyVoucher(code, Number(subtotal) || 0);
    res.json({
      success: true,
      data: {
        valid: true,
        discountAmount: result.discountAmount,
        voucher: result.voucher
          ? {
              code: result.voucher.code,
              type: result.voucher.type,
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
