const crypto = require("crypto");
const config = require("../config");

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatVnpayDate(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function encodeVnpayValue(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

function buildSignedData(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${encodeVnpayValue(key)}=${encodeVnpayValue(params[key])}`)
    .join("&");
}

function signParams(params, secret) {
  return crypto.createHmac("sha512", secret).update(buildSignedData(params), "utf8").digest("hex");
}

function hmacSha256(data, secret) {
  return crypto.createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

function hasVnpayConfig() {
  return Boolean(config.payment.vnpay.tmnCode && config.payment.vnpay.hashSecret);
}

function hasMomoConfig() {
  return Boolean(
    config.payment.momo.partnerCode &&
      config.payment.momo.accessKey &&
      config.payment.momo.secretKey
  );
}

function isMockEnabled() {
  return config.payment.mockEnabled;
}

function makeTxnRef(method, orderCode) {
  return `${method}_${orderCode}_${Date.now()}`;
}

function extractOrderCode(txnRef = "") {
  const parts = String(txnRef).split("_");
  return parts.length >= 3 ? parts.slice(1, -1).join("_") : String(txnRef);
}

function getDefaultReturnUrl(method) {
  if (method === "VNPAY") {
    return (
      config.payment.vnpay.returnUrl ||
      `${config.apiPublicUrl.replace(/\/$/, "")}/api/orders/payment-return/vnpay`
    );
  }
  if (method === "MOMO") {
    return (
      config.payment.momo.redirectUrl ||
      `${config.apiPublicUrl.replace(/\/$/, "")}/api/orders/payment-return/momo`
    );
  }
  return `${config.apiPublicUrl.replace(/\/$/, "")}/api/orders/payment-return/mock`;
}

function getDefaultIpnUrl(method) {
  if (method === "MOMO") {
    return (
      config.payment.momo.ipnUrl ||
      `${config.apiPublicUrl.replace(/\/$/, "")}/api/orders/webhook/momo`
    );
  }
  return "";
}

function buildFrontendPaymentUrl(order, status, fallbackUrl) {
  const base = (
    order?.payment?.frontendReturnUrl ||
    fallbackUrl ||
    config.frontendUrl
  ).replace(/\/$/, "");
  const url = new URL(`${base}/payment-result`);
  url.searchParams.set("status", status);
  if (order?._id) url.searchParams.set("orderId", String(order._id));
  if (order?.orderCode) url.searchParams.set("orderCode", order.orderCode);
  return url.toString();
}

function buildFrontendGatewayReturnUrl({ gateway, orderCode, frontendUrl }) {
  const base = (frontendUrl || config.frontendUrl).replace(/\/$/, "");
  const url = new URL(`${base}/payment-result`);
  url.searchParams.set("gateway", gateway);
  url.searchParams.set("status", "returned");
  if (orderCode) url.searchParams.set("orderCode", orderCode);
  return url.toString();
}

function createMockPaymentUrl({ orderCode, method, transactionId }) {
  const url = new URL(`${config.apiPublicUrl.replace(/\/$/, "")}/api/orders/gateway/mock`);
  url.searchParams.set("orderCode", orderCode);
  url.searchParams.set("method", method);
  url.searchParams.set("txnRef", transactionId);
  return url.toString();
}

function createVnpayPaymentUrl({ orderCode, amount, returnUrl, clientIp }) {
  const transactionId = makeTxnRef("VNPAY", orderCode);
  const params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: config.payment.vnpay.tmnCode,
    vnp_Amount: Math.round(Number(amount) * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: transactionId,
    vnp_OrderInfo: `Thanh toan don hang ${orderCode}`,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: returnUrl || getDefaultReturnUrl("VNPAY"),
    vnp_IpAddr: clientIp || "127.0.0.1",
    vnp_CreateDate: formatVnpayDate(),
  };

  params.vnp_SecureHash = signParams(params, config.payment.vnpay.hashSecret);

  return {
    paymentUrl: `${config.payment.vnpay.paymentUrl}?${buildSignedData(params)}`,
    transactionId,
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Payment gateway HTTP ${response.status}`);
  }
  return data;
}

async function createMomoPaymentUrl({ orderCode, amount, returnUrl, frontendUrl }) {
  const transactionId = makeTxnRef("MOMO", orderCode);
  const requestType = "payWithMethod";
  const extraData = "";
  const redirectUrl =
    returnUrl ||
    buildFrontendGatewayReturnUrl({
      gateway: "momo",
      orderCode,
      frontendUrl,
    });
  const ipnUrl = getDefaultIpnUrl("MOMO");
  const roundedAmount = Math.round(Number(amount));
  const orderInfo = `Thanh toan don hang ${orderCode}`;

  const rawSignature =
    `accessKey=${config.payment.momo.accessKey}` +
    `&amount=${roundedAmount}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${ipnUrl}` +
    `&orderId=${transactionId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${config.payment.momo.partnerCode}` +
    `&redirectUrl=${redirectUrl}` +
    `&requestId=${transactionId}` +
    `&requestType=${requestType}`;

  const payload = {
    partnerCode: config.payment.momo.partnerCode,
    requestId: transactionId,
    amount: roundedAmount,
    orderId: transactionId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    requestType,
    extraData,
    lang: "vi",
    signature: hmacSha256(rawSignature, config.payment.momo.secretKey),
  };

  const result = await postJson(config.payment.momo.endpoint, payload);
  if (Number(result.resultCode) !== 0 || !result.payUrl) {
    throw new Error(result.message || "MoMo không trả về payUrl");
  }

  return { paymentUrl: result.payUrl, transactionId };
}

async function createPaymentUrl({ orderCode, amount, method, returnUrl, clientIp, frontendUrl }) {
  const normalizedMethod = String(method || "").toUpperCase();

  if (normalizedMethod === "VNPAY" && hasVnpayConfig()) {
    return createVnpayPaymentUrl({ orderCode, amount, returnUrl, clientIp });
  }
  if (normalizedMethod === "MOMO" && hasMomoConfig()) {
    return createMomoPaymentUrl({ orderCode, amount, returnUrl, frontendUrl });
  }
  if (!isMockEnabled()) {
    throw new Error(`Cổng thanh toán ${normalizedMethod} chưa được cấu hình`);
  }

  const transactionId = makeTxnRef(normalizedMethod || "PAYMENT", orderCode);
  return {
    paymentUrl: createMockPaymentUrl({
      orderCode,
      method: normalizedMethod,
      transactionId,
      frontendUrl,
    }),
    transactionId,
    mock: true,
  };
}

function verifyVnpayReturn(query = {}) {
  const params = { ...query };
  const receivedHash = params.vnp_SecureHash;
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  if (!receivedHash || !hasVnpayConfig()) {
    return { valid: false, transactionId: params.vnp_TxnRef || "" };
  }

  const expectedHash = signParams(params, config.payment.vnpay.hashSecret);
  return {
    valid: expectedHash.toLowerCase() === String(receivedHash).toLowerCase(),
    transactionId: params.vnp_TxnRef || "",
  };
}

function verifyVnpayPayload(payload = {}) {
  return verifyVnpayReturn(payload);
}

function verifyMomoPayload(payload = {}) {
  if (!hasMomoConfig()) {
    return { valid: false, transactionId: payload.orderId || "" };
  }

  const rawSignature =
    `accessKey=${config.payment.momo.accessKey}` +
    `&amount=${payload.amount}` +
    `&extraData=${payload.extraData || ""}` +
    `&message=${payload.message || ""}` +
    `&orderId=${payload.orderId || ""}` +
    `&orderInfo=${payload.orderInfo || ""}` +
    `&orderType=${payload.orderType || ""}` +
    `&partnerCode=${payload.partnerCode || ""}` +
    `&payType=${payload.payType || ""}` +
    `&requestId=${payload.requestId || ""}` +
    `&responseTime=${payload.responseTime || ""}` +
    `&resultCode=${payload.resultCode}` +
    `&transId=${payload.transId || ""}`;

  const expected = hmacSha256(rawSignature, config.payment.momo.secretKey);
  return {
    valid: expected.toLowerCase() === String(payload.signature || "").toLowerCase(),
    transactionId: payload.orderId || payload.requestId || "",
  };
}

function verifyWebhookSignature({ payload, signature, secret }) {
  if (!secret) return true;
  const raw =
    typeof payload === "string" ? payload : JSON.stringify(payload || {});
  const expected = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex");
  return expected === signature;
}

async function requestRefund({ transactionId, amount, reason }) {
  if (!transactionId) {
    return { ok: false, error: "Missing transactionId" };
  }
  const refundTransactionId = `RF-${transactionId}-${Date.now()}`;
  return {
    ok: true,
    refundTransactionId,
    amount,
    reason,
    status: "PENDING_GATEWAY",
  };
}

module.exports = {
  buildFrontendPaymentUrl,
  createPaymentUrl,
  extractOrderCode,
  isMockEnabled,
  requestRefund,
  verifyMomoPayload,
  verifyVnpayPayload,
  verifyVnpayReturn,
  verifyWebhookSignature,
};
