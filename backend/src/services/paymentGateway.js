const crypto = require("crypto");
const config = require("../config");

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatVnpayDate(date = new Date()) {
  // VNPay requires merchant timestamps in GMT+7 regardless of server timezone.
  const gmt7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return [
    gmt7.getUTCFullYear(),
    pad(gmt7.getUTCMonth() + 1),
    pad(gmt7.getUTCDate()),
    pad(gmt7.getUTCHours()),
    pad(gmt7.getUTCMinutes()),
    pad(gmt7.getUTCSeconds()),
  ].join("");
}

function timingSafeHexEqual(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  if (!/^[a-f0-9]+$/i.test(actual) || !/^[a-f0-9]+$/i.test(expected)) {
    return false;
  }
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
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
  return `${method}_${orderCode}_${Date.now()}${crypto.randomBytes(4).toString("hex")}`;
}

const createPaymentReference = makeTxnRef;

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

function createVnpayPaymentUrl({
  orderCode,
  amount,
  returnUrl,
  clientIp,
  transactionId = makeTxnRef("VNPAY", orderCode),
}) {
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

async function postJson(url, body, { timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Payment gateway timed out after ${timeoutMs}ms`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Payment gateway HTTP ${response.status}`);
  }
  return data;
}

async function createMomoPaymentUrl({
  orderCode,
  amount,
  returnUrl,
  frontendUrl,
  transactionId = makeTxnRef("MOMO", orderCode),
}) {
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

async function createPaymentUrl({
  orderCode,
  amount,
  method,
  returnUrl,
  clientIp,
  frontendUrl,
  transactionId,
}) {
  const normalizedMethod = String(method || "").toUpperCase();

  if (normalizedMethod === "VNPAY" && hasVnpayConfig()) {
    return createVnpayPaymentUrl({
      orderCode,
      amount,
      returnUrl,
      clientIp,
      transactionId,
    });
  }
  if (normalizedMethod === "MOMO" && hasMomoConfig()) {
    return createMomoPaymentUrl({
      orderCode,
      amount,
      returnUrl,
      frontendUrl,
      transactionId,
    });
  }
  if (!isMockEnabled()) {
    throw new Error(`Cổng thanh toán ${normalizedMethod} chưa được cấu hình`);
  }

  const mockTransactionId =
    transactionId || makeTxnRef(normalizedMethod || "PAYMENT", orderCode);
  return {
    paymentUrl: createMockPaymentUrl({
      orderCode,
      method: normalizedMethod,
      transactionId: mockTransactionId,
      frontendUrl,
    }),
    transactionId: mockTransactionId,
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
    valid: timingSafeHexEqual(String(receivedHash), expectedHash),
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
    valid:
      String(payload.partnerCode || "") === config.payment.momo.partnerCode &&
      timingSafeHexEqual(String(payload.signature || ""), expected),
    transactionId: payload.orderId || payload.requestId || "",
  };
}

function verifyWebhookSignature({
  payload,
  rawPayload,
  signature,
  timestamp,
  secret,
  toleranceMs = 5 * 60 * 1000,
}) {
  if (!secret || !signature || !timestamp) return false;
  const timestampMs = Number(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > toleranceMs
  ) {
    return false;
  }
  const raw =
    typeof rawPayload === "string"
      ? rawPayload
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload || {});
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return timingSafeHexEqual(String(signature), expected);
}

function deterministicRefundId(idempotencyKey, maxLength = 32) {
  const hash = crypto
    .createHash("sha256")
    .update(String(idempotencyKey || ""))
    .digest("hex");
  return `RF${hash}`.slice(0, maxLength);
}

function uniqueVnpayQueryId(idempotencyKey) {
  const entropy = `${idempotencyKey || ""}:${Date.now()}:${crypto
    .randomBytes(8)
    .toString("hex")}`;
  return `Q${crypto.createHash("sha256").update(entropy).digest("hex")}`.slice(
    0,
    32
  );
}

function resolveVnpayRefundIdentity(amount, originalAmount) {
  const refundAmount = Math.round(Number(amount) * 100);
  const paymentAmount = Math.round(Number(originalAmount) * 100);
  if (
    !Number.isSafeInteger(refundAmount) ||
    refundAmount <= 0 ||
    !Number.isSafeInteger(paymentAmount) ||
    paymentAmount <= 0 ||
    refundAmount > paymentAmount
  ) {
    return null;
  }
  return {
    amount: refundAmount,
    transactionType: refundAmount === paymentAmount ? "02" : "03",
  };
}

function signVnpayRefundRequest(payload) {
  const fields = [
    "vnp_RequestId",
    "vnp_Version",
    "vnp_Command",
    "vnp_TmnCode",
    "vnp_TransactionType",
    "vnp_TxnRef",
    "vnp_Amount",
    "vnp_TransactionNo",
    "vnp_TransactionDate",
    "vnp_CreateBy",
    "vnp_CreateDate",
    "vnp_IpAddr",
    "vnp_OrderInfo",
  ];
  const data = fields.map((field) => payload[field] || "").join("|");
  return crypto
    .createHmac("sha512", config.payment.vnpay.hashSecret)
    .update(data, "utf8")
    .digest("hex");
}

function verifyVnpayRefundResponse(payload = {}) {
  const fields = [
    "vnp_ResponseId",
    "vnp_Command",
    "vnp_ResponseCode",
    "vnp_Message",
    "vnp_TmnCode",
    "vnp_TxnRef",
    "vnp_Amount",
    "vnp_BankCode",
    "vnp_PayDate",
    "vnp_TransactionNo",
    "vnp_TransactionType",
    "vnp_TransactionStatus",
    "vnp_OrderInfo",
  ];
  const data = fields.map((field) => payload[field] || "").join("|");
  const expected = crypto
    .createHmac("sha512", config.payment.vnpay.hashSecret)
    .update(data, "utf8")
    .digest("hex");
  return timingSafeHexEqual(String(payload.vnp_SecureHash || ""), expected);
}

function verifyVnpayQueryResponse(payload = {}) {
  const fields = [
    "vnp_ResponseId",
    "vnp_Command",
    "vnp_ResponseCode",
    "vnp_Message",
    "vnp_TmnCode",
    "vnp_TxnRef",
    "vnp_Amount",
    "vnp_BankCode",
    "vnp_PayDate",
    "vnp_TransactionNo",
    "vnp_TransactionType",
    "vnp_TransactionStatus",
    "vnp_OrderInfo",
    "vnp_PromotionCode",
    "vnp_PromotionAmount",
  ];
  const data = fields.map((field) => payload[field] || "").join("|");
  const expected = crypto
    .createHmac("sha512", config.payment.vnpay.hashSecret)
    .update(data, "utf8")
    .digest("hex");
  return timingSafeHexEqual(String(payload.vnp_SecureHash || ""), expected);
}

function matchesVnpayRefundIdentity(result, expected) {
  return (
    String(result.vnp_TmnCode || "") === config.payment.vnpay.tmnCode &&
    String(result.vnp_TxnRef || "") === String(expected.providerOrderId) &&
    String(result.vnp_Amount || "") === String(expected.amount) &&
    String(result.vnp_TransactionType || "") === expected.transactionType
  );
}

async function requestVnpayRefund({
  providerOrderId,
  transactionId,
  providerCreatedAt,
  amount,
  originalAmount,
  reason,
  idempotencyKey,
  clientIp,
  initiatedBy,
}) {
  if (!providerOrderId || !providerCreatedAt) {
    return { ok: false, error: "Missing original VNPay payment reference" };
  }
  const refundIdentity = resolveVnpayRefundIdentity(amount, originalAmount);
  if (!refundIdentity) {
    return { ok: false, error: "Invalid VNPay refund or original payment amount" };
  }
  const now = new Date();
  const payload = {
    vnp_RequestId: deterministicRefundId(idempotencyKey),
    vnp_Version: "2.1.0",
    vnp_Command: "refund",
    vnp_TmnCode: config.payment.vnpay.tmnCode,
    vnp_TransactionType: refundIdentity.transactionType,
    vnp_TxnRef: providerOrderId,
    vnp_Amount: refundIdentity.amount,
    vnp_TransactionNo: transactionId || "",
    vnp_TransactionDate: formatVnpayDate(new Date(providerCreatedAt)),
    vnp_CreateBy: String(initiatedBy || "bookshop").slice(0, 245),
    vnp_CreateDate: formatVnpayDate(now),
    vnp_IpAddr: clientIp || config.payment.vnpay.refundIp,
    vnp_OrderInfo: String(reason || "Refund order").slice(0, 255),
  };
  payload.vnp_SecureHash = signVnpayRefundRequest(payload);

  const result = await postJson(config.payment.vnpay.apiUrl, payload, {
    timeoutMs: 35_000,
  });
  if (!verifyVnpayRefundResponse(result)) {
    return {
      ok: false,
      unknown: true,
      error: "Invalid VNPay refund response signature",
    };
  }
  if (
    String(result.vnp_Command || "") !== "refund" ||
    !matchesVnpayRefundIdentity(result, {
      providerOrderId,
      ...refundIdentity,
    })
  ) {
    return {
      ok: false,
      unknown: true,
      error: "VNPay refund response does not match the request",
    };
  }
  if (!["00", "94"].includes(String(result.vnp_ResponseCode))) {
    return { ok: false, error: result.vnp_Message || "VNPay refund rejected" };
  }
  return {
    ok: true,
    refundTransactionId:
      String(result.vnp_TransactionNo || result.vnp_ResponseId || payload.vnp_RequestId),
    status: result.vnp_TransactionStatus || "PENDING_GATEWAY",
    completed: String(result.vnp_TransactionStatus || "") === "00",
    rawPayload: result,
  };
}

async function requestMomoRefund({
  transactionId,
  amount,
  reason,
  idempotencyKey,
}) {
  if (!/^\d+$/.test(String(transactionId || ""))) {
    return { ok: false, error: "Missing original MoMo transId" };
  }
  const requestId = deterministicRefundId(idempotencyKey, 32);
  const orderId = requestId;
  const roundedAmount = Math.round(Number(amount));
  const description = String(reason || "Refund order").slice(0, 255);
  const rawSignature =
    `accessKey=${config.payment.momo.accessKey}` +
    `&amount=${roundedAmount}` +
    `&description=${description}` +
    `&orderId=${orderId}` +
    `&partnerCode=${config.payment.momo.partnerCode}` +
    `&requestId=${requestId}` +
    `&transId=${transactionId}`;
  const payload = {
    partnerCode: config.payment.momo.partnerCode,
    orderId,
    requestId,
    amount: roundedAmount,
    transId: Number(transactionId),
    lang: "vi",
    description,
    signature: hmacSha256(rawSignature, config.payment.momo.secretKey),
  };
  const result = await postJson(config.payment.momo.refundEndpoint, payload, {
    // MoMo's current refund specification requires at least a 30s timeout.
    timeoutMs: 35_000,
  });
  if (Number(result.resultCode) !== 0) {
    return { ok: false, error: result.message || "MoMo refund rejected" };
  }
  return {
    ok: true,
    refundTransactionId: String(result.transId || result.orderId || orderId),
    status: "COMPLETED",
    completed: true,
    rawPayload: result,
  };
}

// Mock refunds normally settle immediately, which means the "gateway accepted
// but has not settled" path - the one VNPay really produces - would never be
// exercised outside production. Setting PAYMENT_MOCK_REFUND_PENDING=true makes
// mock refunds land in that state instead, so the reconciliation job and the
// waiting states can be driven end to end locally.
function mockRefundPendingEnabled() {
  return process.env.PAYMENT_MOCK_REFUND_PENDING === "true";
}

// How many lookups a pending mock refund stays pending for before it settles,
// so a poller can be watched actually converging rather than flipping at once.
const MOCK_QUERY_SETTLE_AFTER = Number(
  process.env.PAYMENT_MOCK_REFUND_SETTLE_AFTER || 1
);
const mockQueryAttempts = new Map();

function mockRefundQuery(idempotencyKey) {
  const key = String(idempotencyKey || "");
  if (!mockRefundPendingEnabled()) {
    return { ok: true, completed: true, failed: false, status: "00", mock: true };
  }
  const seen = (mockQueryAttempts.get(key) || 0) + 1;
  mockQueryAttempts.set(key, seen);
  const settled = seen > MOCK_QUERY_SETTLE_AFTER;
  return {
    ok: true,
    completed: settled,
    failed: false,
    status: settled ? "00" : "01",
    refundTransactionId: deterministicRefundId(key),
    mock: true,
  };
}

/** Test seam: forget how many times a mock refund has been polled. */
function resetMockRefundQueries() {
  mockQueryAttempts.clear();
}

/**
 * Sign a VNPay `querydr` lookup. Same HMAC-SHA512 pipe-joined scheme as a
 * refund request, but querydr carries a smaller field set - sending the refund
 * field list here produces a signature VNPay rejects.
 */
function signVnpayQueryRequest(payload) {
  const fields = [
    "vnp_RequestId",
    "vnp_Version",
    "vnp_Command",
    "vnp_TmnCode",
    "vnp_TxnRef",
    "vnp_TransactionDate",
    "vnp_CreateDate",
    "vnp_IpAddr",
    "vnp_OrderInfo",
  ];
  const data = fields.map((field) => payload[field] || "").join("|");
  return crypto
    .createHmac("sha512", config.payment.vnpay.hashSecret)
    .update(data, "utf8")
    .digest("hex");
}

/**
 * Ask VNPay what actually happened to a transaction.
 *
 * `requestRefund` only tells us the instruction was accepted; this is how we
 * find out whether the money moved. `vnp_TransactionStatus` is the answer:
 *
 *   "00"  settled - the customer has the money
 *   "01"/"05"/"06"  still in flight at the bank
 *   "02"/"04"/"07"/"09"  terminal failure/rejection
 *
 * Returns `{ ok }` for whether the lookup itself worked, separately from
 * `{ completed, failed }` for what it found. A lookup that fails (network,
 * signature) is not evidence the refund failed, so callers must keep waiting
 * rather than writing it off.
 */
async function queryVnpayRefund({
  providerOrderId,
  providerCreatedAt,
  idempotencyKey,
  amount,
  originalAmount,
  reason,
  clientIp,
}) {
  if (!providerOrderId || !providerCreatedAt) {
    return { ok: false, error: "Missing original VNPay payment reference" };
  }
  const refundIdentity = resolveVnpayRefundIdentity(amount, originalAmount);
  if (!refundIdentity) {
    return { ok: false, error: "Invalid VNPay refund or original payment amount" };
  }
  const payload = {
    // VNPay rejects a query request id reused on the same day. A reconciliation
    // pass is a new lookup, even though it belongs to the same refund operation.
    vnp_RequestId: uniqueVnpayQueryId(idempotencyKey),
    vnp_Version: "2.1.0",
    vnp_Command: "querydr",
    vnp_TmnCode: config.payment.vnpay.tmnCode,
    vnp_TxnRef: providerOrderId,
    vnp_TransactionDate: formatVnpayDate(new Date(providerCreatedAt)),
    vnp_CreateDate: formatVnpayDate(new Date()),
    vnp_IpAddr: clientIp || config.payment.vnpay.refundIp,
    vnp_OrderInfo: String(reason || "Query refund").slice(0, 255),
  };
  payload.vnp_SecureHash = signVnpayQueryRequest(payload);

  const result = await postJson(config.payment.vnpay.apiUrl, payload, {
    timeoutMs: 35_000,
  });
  if (!verifyVnpayQueryResponse(result)) {
    return { ok: false, error: "Invalid VNPay query response signature" };
  }
  const responseCode = String(result.vnp_ResponseCode || "");
  if (responseCode !== "00") {
    return { ok: false, error: result.vnp_Message || "VNPay query rejected" };
  }
  if (
    String(result.vnp_Command || "") !== "querydr" ||
    !matchesVnpayRefundIdentity(result, {
      providerOrderId,
      ...refundIdentity,
    })
  ) {
    return {
      ok: false,
      error: "VNPay query result does not match the requested refund",
    };
  }
  const transactionStatus = String(result.vnp_TransactionStatus || "");
  const completed = transactionStatus === "00";
  const pending = ["", "01", "05", "06"].includes(transactionStatus);
  return {
    ok: true,
    completed,
    // Only a terminal non-success status is a real failure. Anything the bank
    // is still working on stays pending.
    failed: !completed && !pending,
    status: transactionStatus,
    refundTransactionId: String(result.vnp_TransactionNo || ""),
    rawPayload: result,
  };
}

/**
 * Find out whether a refund already sent to a gateway has actually settled.
 *
 * Companion to `requestRefund`: that one starts a refund, this one checks on
 * it. Only VNPay needs it - MoMo settles synchronously and reports `completed`
 * in the original response.
 */
async function queryRefundStatus({
  method,
  providerOrderId,
  transactionId,
  providerCreatedAt,
  idempotencyKey,
  amount,
  originalAmount,
  reason,
  clientIp,
}) {
  const normalizedMethod = String(method || "").toUpperCase();
  if (normalizedMethod === "VNPAY" && hasVnpayConfig()) {
    return queryVnpayRefund({
      providerOrderId: providerOrderId || transactionId,
      providerCreatedAt,
      idempotencyKey,
      amount,
      originalAmount,
      reason,
      clientIp,
    });
  }
  if (normalizedMethod === "MOMO" && hasMomoConfig()) {
    // MoMo's refund call is synchronous, so a refund that reached this point
    // was already reported settled. Nothing to poll.
    return { ok: true, completed: true, failed: false, status: "COMPLETED" };
  }
  if (!isMockEnabled()) {
    return {
      ok: false,
      error: `Refund gateway ${normalizedMethod} is not configured`,
    };
  }
  return mockRefundQuery(idempotencyKey);
}

async function requestRefund({
  method,
  providerOrderId,
  transactionId,
  providerCreatedAt,
  amount,
  originalAmount,
  reason,
  idempotencyKey,
  clientIp,
  initiatedBy,
}) {
  const normalizedMethod = String(method || "").toUpperCase();
  if (!transactionId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { ok: false, error: "Invalid refund transaction or amount" };
  }
  if (!idempotencyKey) {
    return { ok: false, error: "Missing refund idempotency key" };
  }
  if (normalizedMethod === "VNPAY" && hasVnpayConfig()) {
    return requestVnpayRefund({
      providerOrderId,
      transactionId,
      providerCreatedAt,
      amount,
      originalAmount,
      reason,
      idempotencyKey,
      clientIp,
      initiatedBy,
    });
  }
  if (normalizedMethod === "MOMO" && hasMomoConfig()) {
    return requestMomoRefund({
      transactionId,
      amount,
      reason,
      idempotencyKey,
    });
  }
  if (!isMockEnabled()) {
    return { ok: false, error: `Refund gateway ${normalizedMethod} is not configured` };
  }
  const pending = mockRefundPendingEnabled();
  return {
    ok: true,
    refundTransactionId: deterministicRefundId(idempotencyKey),
    amount,
    status: pending ? "PENDING_GATEWAY" : "COMPLETED",
    completed: !pending,
    mock: true,
  };
}

module.exports = {
  buildFrontendPaymentUrl,
  createPaymentReference,
  createPaymentUrl,
  extractOrderCode,
  isMockEnabled,
  queryRefundStatus,
  requestRefund,
  resetMockRefundQueries,
  verifyMomoPayload,
  verifyVnpayPayload,
  verifyVnpayReturn,
  verifyWebhookSignature,
};
