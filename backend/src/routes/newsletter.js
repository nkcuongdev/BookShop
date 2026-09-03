const express = require("express");
const config = require("../config");
const { asyncHandler } = require("../middleware/errorHandler");
const { sendNewsletterConfirmation } = require("../services/emailService");
const {
  clearFailedNewsletterConfirmation,
  confirmNewsletterSubscription,
  issueNewsletterConfirmation,
  normalizeEmail,
  unsubscribeNewsletter,
} = require("../services/newsletterService");
const { createRateLimiter, hashRateLimitPart } = require("../utils/security");

const router = express.Router();
const subscribeIpLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 20,
  keyPrefix: "newsletter-subscribe-ip",
  message: "Bạn đã đăng ký quá nhiều lần, vui lòng thử lại sau",
});
const subscribeEmailLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60_000,
  max: 5,
  keyPrefix: "newsletter-subscribe-email",
  message: "Email này đã được yêu cầu đăng ký quá nhiều lần",
  keyGenerator: (req) => hashRateLimitPart(req.body?.email || ""),
});
const confirmLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 20,
  keyPrefix: "newsletter-confirm",
  message: "Bạn đã thử xác nhận quá nhiều lần",
  keyGenerator: (req) => hashRateLimitPart(req.body?.token || ""),
});
const unsubscribeLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 20,
  keyPrefix: "newsletter-unsubscribe",
  message: "Bạn đã thử hủy đăng ký quá nhiều lần",
  keyGenerator: (req) => hashRateLimitPart(req.body?.token || ""),
});

router.post(
  "/subscribe",
  subscribeIpLimiter,
  subscribeEmailLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ success: false, message: "Email không hợp lệ" });
    }

    const issued = await issueNewsletterConfirmation(email);
    let confirmationUrl;
    if (issued.token) {
      confirmationUrl = `${config.frontendUrl}/newsletter/confirm?token=${encodeURIComponent(
        issued.token
      )}`;
      try {
        await sendNewsletterConfirmation(email, confirmationUrl);
      } catch (error) {
        await clearFailedNewsletterConfirmation(email, issued.token);
        throw error;
      }
    }

    return res.status(202).json({
      success: true,
      message: "Nếu email chưa đăng ký, BookShop đã gửi liên kết xác nhận.",
      ...(confirmationUrl && process.env.NODE_ENV !== "production"
        ? { data: { confirmationUrl } }
        : {}),
    });
  })
);

router.post(
  "/confirm",
  confirmLimiter,
  asyncHandler(async (req, res) => {
    const subscription = await confirmNewsletterSubscription(req.body?.token);
    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: "Liên kết xác nhận đã hết hạn hoặc đã được sử dụng",
      });
    }
    return res.json({ success: true, message: "Đăng ký nhận tin thành công" });
  })
);

router.post(
  "/unsubscribe",
  unsubscribeLimiter,
  asyncHandler(async (req, res) => {
    const result = await unsubscribeNewsletter(req.body?.token);
    if (!result) {
      return res.status(400).json({
        success: false,
        message: "Liên kết hủy đăng ký không hợp lệ",
      });
    }
    return res.json({
      success: true,
      message: result.alreadyUnsubscribed
        ? "Email này đã hủy đăng ký trước đó"
        : "Đã hủy đăng ký nhận newsletter",
    });
  })
);

module.exports = router;
