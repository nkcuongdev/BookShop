require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "dev_only_fallback_secret");

if (isProduction && !jwtSecret) {
  throw new Error("JWT_SECRET is required in production");
}

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  apiPublicUrl:
    process.env.API_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || 5000}`,
  payment: {
    mockEnabled:
      process.env.PAYMENT_MOCK_ENABLED === "true" ||
      process.env.NODE_ENV !== "production",
    vnpay: {
      tmnCode: process.env.VNPAY_TMN_CODE || "",
      hashSecret: process.env.VNPAY_HASH_SECRET || "",
      paymentUrl:
        process.env.VNPAY_PAYMENT_URL ||
        "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
      returnUrl: process.env.VNPAY_RETURN_URL || "",
    },
    momo: {
      partnerCode: process.env.MOMO_PARTNER_CODE || "",
      accessKey: process.env.MOMO_ACCESS_KEY || "",
      secretKey: process.env.MOMO_SECRET_KEY || "",
      endpoint:
        process.env.MOMO_ENDPOINT ||
        "https://test-payment.momo.vn/v2/gateway/api/create",
      redirectUrl: process.env.MOMO_REDIRECT_URL || "",
      ipnUrl: process.env.MOMO_IPN_URL || "",
    },
  },
};
