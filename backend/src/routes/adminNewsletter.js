const express = require("express");
const { auth, requirePermission } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const {
  getNewsletterOverview,
  sendNewsletterBroadcast,
} = require("../services/newsletterService");
const { createRateLimiter } = require("../utils/security");

const router = express.Router();
const sendLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 10,
  keyPrefix: "admin-newsletter-send",
  message: "Đã gửi newsletter quá nhiều lần, vui lòng thử lại sau",
});

router.use(auth, requirePermission("newsletter.manage"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    return res.json({ success: true, data: await getNewsletterOverview() });
  })
);

router.post(
  "/send",
  sendLimiter,
  asyncHandler(async (req, res) => {
    const contentType = String(req.body?.contentType || "").toLowerCase();
    if (!["post", "promotion", "voucher"].includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: "Loại nội dung newsletter không hợp lệ",
      });
    }
    let result;
    try {
      result = await sendNewsletterBroadcast({
        contentType,
        contentId: req.body?.contentId,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      throw error;
    }
    return res.json({
      success: true,
      message: result.recipientCount
        ? "Đã xử lý gửi newsletter"
        : "Chưa có subscriber đang hoạt động",
      data: result,
    });
  })
);

module.exports = router;
