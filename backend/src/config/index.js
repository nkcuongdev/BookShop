require("dotenv").config();
const path = require("path");

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const GHN_SANDBOX_BASE_URL =
  "https://dev-online-gateway.ghn.vn/shiip/public-api";
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "dev_only_fallback_secret");
const jwtRefreshSecret =
  process.env.JWT_REFRESH_SECRET ||
  (isProduction ? "" : `${jwtSecret}_refresh`);
const toHttpsUrl = (host) => {
  if (!host) return "";
  const value = String(host).trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};
const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
const useCloudinary =
  hasCloudinaryConfig &&
  (!isTest || process.env.CLOUDINARY_TEST_ENABLED === "true");
const rateLimitRedisUrl =
  process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || "";
const renderExternalUrl = toHttpsUrl(process.env.RENDER_EXTERNAL_HOSTNAME);
const boundedInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

if (
  isProduction &&
  (!jwtSecret ||
    !jwtRefreshSecret ||
    Buffer.byteLength(jwtSecret, "utf8") < 32 ||
    Buffer.byteLength(jwtRefreshSecret, "utf8") < 32 ||
    jwtSecret === jwtRefreshSecret)
) {
  throw new Error(
    "JWT secrets must be distinct and at least 32 bytes in production"
  );
}

if (isProduction && !rateLimitRedisUrl) {
  throw new Error(
    "RATE_LIMIT_REDIS_URL is required in production for shared abuse limits"
  );
}

if (isProduction) {
  const requiredFeatureVariables = [
    "MONGO_URI",
    "MAIL_FROM",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const missing = requiredFeatureVariables.filter(
    (name) => !String(process.env[name] || "").trim()
  );
  const hasResend = Boolean(String(process.env.RESEND_API_KEY || "").trim());
  const hasSmtp = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
  );
  if (!hasResend && !hasSmtp) {
    missing.push("RESEND_API_KEY (or complete SMTP credentials)");
  }
  if (missing.length) {
    throw new Error(
      `Missing required production configuration: ${missing.join(", ")}`
    );
  }
  const ghnVariables = [
    "GHN_SANDBOX_TOKEN",
    "GHN_SANDBOX_SHOP_ID",
  ];
  const hasAnyGhnVariable = ghnVariables.some((name) =>
    String(process.env[name] || "").trim()
  );
  const missingGhnVariables = ghnVariables.filter(
    (name) => !String(process.env[name] || "").trim()
  );
  if (hasAnyGhnVariable && missingGhnVariables.length) {
    throw new Error(
      `Incomplete GHN sandbox configuration: ${missingGhnVariables.join(", ")}`
    );
  }
}

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/bookshop",
  jwtSecret,
  jwtRefreshSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  jwtIssuer: "bookshop-api",
  jwtAudience: "bookshop-web",
  frontendUrl:
    process.env.FRONTEND_URL ||
    process.env.APP_PUBLIC_URL ||
    toHttpsUrl(process.env.FRONTEND_HOST) ||
    renderExternalUrl ||
    "http://localhost:5173",
  apiPublicUrl:
    process.env.API_PUBLIC_URL ||
    process.env.APP_PUBLIC_URL ||
    toHttpsUrl(process.env.API_PUBLIC_HOST) ||
    renderExternalUrl ||
    `http://localhost:${process.env.PORT || 5000}`,
  upload: {
    provider: useCloudinary ? "cloudinary" : isProduction ? "disabled" : "local",
    localDir: path.resolve(__dirname, "../../data/uploads"),
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
      apiKey: process.env.CLOUDINARY_API_KEY || "",
      apiSecret: process.env.CLOUDINARY_API_SECRET || "",
      folder: process.env.CLOUDINARY_FOLDER || "bookshop/books",
    },
  },
  rateLimit: {
    redisUrl: rateLimitRedisUrl,
  },
  inventory: {
    // Applied to books that have not set their own reorderPoint, preserving the
    // previous hard-coded low-stock threshold.
    defaultReorderPoint: boundedInteger(
      process.env.INVENTORY_DEFAULT_REORDER_POINT,
      5,
      0,
      10_000
    ),
    // How long to wait before re-alerting on a book that is still low.
    lowStockAlertCooldownMs:
      boundedInteger(process.env.INVENTORY_LOW_STOCK_COOLDOWN_HOURS, 24, 1, 720) *
      60 *
      60 *
      1000,
  },
  cartReminder: {
    // Abandoned-cart nudges are opt-out marketing, so the whole feature can be
    // switched off without redeploying the worker.
    enabled: process.env.CART_REMINDER_ENABLED !== "false",
    // A cart is "abandoned" once it has sat untouched this long. Keep it above
    // a normal browsing session so active shoppers are never interrupted.
    idleAfterMs:
      boundedInteger(process.env.CART_REMINDER_IDLE_HOURS, 6, 1, 720) *
      60 *
      60 *
      1000,
    // Follow-up nudge, measured from the same last-activity stamp. Set the
    // hours to 0 to send a single reminder only.
    secondReminderAfterMs:
      boundedInteger(process.env.CART_REMINDER_SECOND_HOURS, 72, 0, 1440) *
      60 *
      60 *
      1000,
    // Carts older than this are treated as cold and never chased.
    maxAgeMs:
      boundedInteger(process.env.CART_REMINDER_MAX_AGE_DAYS, 30, 1, 365) *
      24 *
      60 *
      60 *
      1000,
    maxCartsPerTick: boundedInteger(
      process.env.CART_REMINDER_MAX_PER_TICK,
      50,
      1,
      500
    ),
    // Books shown in the email body; the rest are summarised as "+N sản phẩm".
    maxItemsPerEmail: boundedInteger(
      process.env.CART_REMINDER_MAX_ITEMS,
      4,
      1,
      10
    ),
  },
  support: {
    // SLA deadlines skip closed hours when this is enabled, so an out-of-hours
    // ticket is not born already breaching. Disable it for a 24/7 support desk.
    businessHoursEnabled: process.env.SUPPORT_BUSINESS_HOURS !== "false",
    businessHourStart: boundedInteger(process.env.SUPPORT_HOUR_START, 8, 0, 23),
    businessHourEnd: boundedInteger(process.env.SUPPORT_HOUR_END, 21, 1, 24),
    // 1 = Monday … 7 = Sunday.
    businessDays: String(process.env.SUPPORT_BUSINESS_DAYS || "1,2,3,4,5,6")
      .split(",")
      .map((day) => Number.parseInt(day.trim(), 10))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
    timezone: process.env.SUPPORT_TIMEZONE || "Asia/Ho_Chi_Minh",
    // Tickets parked on the customer auto-resolve after this long with no reply.
    staleWaitingCustomerMs:
      boundedInteger(process.env.SUPPORT_WAITING_CUSTOMER_DAYS, 7, 1, 60) *
      24 *
      60 *
      60 *
      1000,
    maxOpenTicketsPerOrder: boundedInteger(
      process.env.SUPPORT_MAX_OPEN_TICKETS_PER_ORDER,
      3,
      1,
      20
    ),
  },
  analytics: {
    retentionSeconds:
      boundedInteger(
        process.env.ANALYTICS_RETENTION_DAYS,
        365,
        30,
        3650
      ) *
      24 *
      60 *
      60,
  },
  orders: {
    onlinePendingTtlMs:
      boundedInteger(
        process.env.ONLINE_PAYMENT_TTL_MINUTES,
        15,
        5,
        60
      ) * 60_000,
    codPendingTtlMs:
      boundedInteger(
        process.env.COD_PENDING_TTL_MINUTES,
        24 * 60,
        15,
        7 * 24 * 60
      ) * 60_000,
    maxPendingCodPerUser: boundedInteger(
      process.env.MAX_PENDING_COD_PER_USER,
      3,
      1,
      20
    ),
    maxPendingOnlinePerUser: boundedInteger(
      process.env.MAX_PENDING_ONLINE_PER_USER,
      3,
      1,
      10
    ),
    maxPaymentAttemptsPerOrder: boundedInteger(
      process.env.MAX_PAYMENT_ATTEMPTS_PER_ORDER,
      3,
      1,
      10
    ),
    paymentRetryCooldownMs:
      boundedInteger(
        process.env.PAYMENT_RETRY_COOLDOWN_SECONDS,
        30,
        5,
        15 * 60
      ) * 1_000,
  },
  mail: {
    enabled: Boolean(
      (process.env.RESEND_API_KEY ||
        (process.env.SMTP_HOST &&
          process.env.SMTP_USER &&
          process.env.SMTP_PASSWORD)) &&
        (!isTest || process.env.MAIL_TEST_ENABLED === "true")
    ),
    provider: process.env.RESEND_API_KEY ? "resend" : "smtp",
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.MAIL_FROM || "BookShop <no-reply@bookshop.local>",
    resendApiKey: process.env.RESEND_API_KEY || "",
    requestTimeoutMs: boundedInteger(
      process.env.MAIL_REQUEST_TIMEOUT_MS,
      8_000,
      1_000,
      30_000
    ),
  },
  shipping: {
    ghn: {
      environment: "sandbox",
      enabled: Boolean(
        process.env.GHN_SANDBOX_TOKEN &&
          process.env.GHN_SANDBOX_SHOP_ID &&
          (!isTest || process.env.GHN_TEST_ENABLED === "true")
      ),
      // This learning project deliberately supports GHN Sandbox only. Keeping
      // the gateway in source prevents a production token from accidentally
      // creating a real pickup request through an environment override.
      baseUrl: GHN_SANDBOX_BASE_URL,
      token: process.env.GHN_SANDBOX_TOKEN || "",
      shopId: boundedInteger(
        process.env.GHN_SANDBOX_SHOP_ID,
        0,
        0,
        2_147_483_647
      ),
      fromDistrictId: boundedInteger(
        process.env.GHN_SANDBOX_FROM_DISTRICT_ID,
        0,
        0,
        2_147_483_647
      ),
      fromWardCode: process.env.GHN_SANDBOX_FROM_WARD_CODE || "",
      requestTimeoutMs: boundedInteger(
        process.env.GHN_SANDBOX_REQUEST_TIMEOUT_MS,
        8_000,
        1_000,
        30_000
      ),
      simulation: {
        enabled: process.env.GHN_SANDBOX_SIMULATION_ENABLED !== "false",
        stepDelayMs: boundedInteger(
          process.env.GHN_SANDBOX_SIMULATION_STEP_MS,
          10_000,
          1_000,
          10 * 60_000
        ),
      },
    },
  },
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
      apiUrl:
        process.env.VNPAY_API_URL ||
        "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
      refundIp: process.env.VNPAY_REFUND_IP || "127.0.0.1",
      returnUrl: process.env.VNPAY_RETURN_URL || "",
    },
    momo: {
      partnerCode: process.env.MOMO_PARTNER_CODE || "",
      accessKey: process.env.MOMO_ACCESS_KEY || "",
      secretKey: process.env.MOMO_SECRET_KEY || "",
      endpoint:
        process.env.MOMO_ENDPOINT ||
        "https://test-payment.momo.vn/v2/gateway/api/create",
      refundEndpoint:
        process.env.MOMO_REFUND_ENDPOINT ||
        "https://test-payment.momo.vn/v2/gateway/api/refund",
      redirectUrl: process.env.MOMO_REDIRECT_URL || "",
      ipnUrl: process.env.MOMO_IPN_URL || "",
    },
  },
};
