const express = require("express");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { clearSessionCookies, revokeAllSessions } = require("../services/authService");
const {
  consumeEmailChange,
  consumeEmailVerification,
  issueEmailVerification,
  issueEmailChange,
  issuePasswordReset,
  isOpaqueToken,
  resetPasswordWithToken,
} = require("../services/accountTokenService");
const { sendEmailVerification, sendPasswordReset } = require("../services/emailService");
const config = require("../config");
const {
  createRateLimiter,
  hashRateLimitPart,
} = require("../utils/security");

const router = express.Router();
const GENERIC_RESET_MESSAGE =
  "Nếu email tồn tại, BookShop đã gửi hướng dẫn đặt lại mật khẩu.";

const recoveryIpLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 20,
  keyPrefix: "password-recovery-ip",
  message: "Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau",
});
const recoveryAccountLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 5,
  keyPrefix: "password-recovery-account",
  message: "Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau",
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    return hashRateLimitPart(email);
  },
});
const verificationIpLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 20,
  keyPrefix: "email-verification-ip",
  message: "Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau",
});
const verificationAccountLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 5,
  keyPrefix: "email-verification-account",
  message: "Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau",
  keyGenerator: (req) => String(req.user?._id || "anonymous"),
});
const resetIpLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 30,
  keyPrefix: "password-reset-ip",
  message: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau",
});
const resetTokenLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  keyPrefix: "password-reset-token",
  message: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau",
  keyGenerator: (req) => hashRateLimitPart(req.body?.token || ""),
});
const verificationTokenIpLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 30,
  keyPrefix: "email-verification-token-ip",
  message: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau",
});
const verificationTokenLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  keyPrefix: "email-verification-token",
  message: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau",
  keyGenerator: (req) => hashRateLimitPart(req.body?.token || ""),
});

function validEmail(value) {
  return (
    typeof value === "string" &&
    value.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

function validPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    Buffer.byteLength(value, "utf8") <= 72
  );
}

function testData(key, url) {
  return process.env.NODE_ENV === "test" ? { [key]: url } : undefined;
}

router.post("/forgot-password", recoveryIpLimiter, recoveryAccountLimiter, asyncHandler(async (req, res) => {
  const email = req.body?.email;
  if (!validEmail(email)) {
    return res.status(400).json({ success: false, message: "Email không hợp lệ" });
  }

  const user = await User.findByEmail(email);
  let resetUrl;
  if (user && user.status === "active") {
    const token = await issuePasswordReset(user);
    resetUrl = `${config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordReset(user.email, resetUrl).catch((error) => {
      console.error("Unable to send password reset email", { message: error.message });
    });
  }

  return res.json({
    success: true,
    message: GENERIC_RESET_MESSAGE,
    ...(resetUrl ? { data: testData("resetUrl", resetUrl) } : {}),
  });
}));

router.post("/reset-password", resetIpLimiter, resetTokenLimiter, asyncHandler(async (req, res) => {
  const { token, password } = req.body || {};
  if (!isOpaqueToken(token) || !validPassword(password)) {
    return res.status(400).json({
      success: false,
      message: "Liên kết không hợp lệ hoặc mật khẩu chưa đạt yêu cầu",
    });
  }

  const user = await resetPasswordWithToken(token, password);
  if (!user) {
    return res.status(400).json({
      success: false,
      message: "Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được sử dụng",
    });
  }

  clearSessionCookies(res);

  return res.json({ success: true, message: "Đặt lại mật khẩu thành công" });
}));

router.post(
  "/email-verification/request",
  auth,
  verificationIpLimiter,
  verificationAccountLimiter,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user.pendingEmail) {
      const token = await issueEmailChange(user, user.pendingEmail);
      const verificationUrl = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
      await sendEmailVerification(user.pendingEmail, verificationUrl);
      return res.json({
        success: true,
        message: "Đã gửi email xác minh địa chỉ mới",
        data: {
          pendingEmail: user.pendingEmail,
          ...testData("verificationUrl", verificationUrl),
        },
      });
    }
    if (user.emailVerifiedAt) {
      return res.json({ success: true, message: "Email đã được xác minh" });
    }

    const token = await issueEmailVerification(user);
    const verificationUrl = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await sendEmailVerification(user.email, verificationUrl);

    return res.json({
      success: true,
      message: "Đã gửi email xác minh",
      data: testData("verificationUrl", verificationUrl),
    });
  })
);

router.post("/email-verification/verify", verificationTokenIpLimiter, verificationTokenLimiter, asyncHandler(async (req, res) => {
  const token = req.body?.token;
  if (!isOpaqueToken(token)) {
    return res.status(400).json({ success: false, message: "Liên kết không hợp lệ" });
  }

  const changedUser = await consumeEmailChange(token);
  if (changedUser) {
    await revokeAllSessions(changedUser._id);
    clearSessionCookies(res);
    return res.json({
      success: true,
      message: "Đổi email thành công. Vui lòng đăng nhập lại.",
      data: { emailChanged: true, reauthRequired: true },
    });
  }

  const user = await consumeEmailVerification(token);
  if (!user) {
    return res.status(400).json({
      success: false,
      message: "Liên kết xác minh đã hết hạn hoặc đã được sử dụng",
    });
  }

  return res.json({ success: true, message: "Xác minh email thành công" });
}));

module.exports = router;
