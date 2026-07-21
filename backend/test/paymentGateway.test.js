process.env.NODE_ENV = "test";
process.env.PAYMENT_MOCK_ENABLED = "true";
process.env.VNPAY_TMN_CODE = "";
process.env.VNPAY_HASH_SECRET = "";
process.env.MOMO_PARTNER_CODE = "";
process.env.MOMO_ACCESS_KEY = "";
process.env.MOMO_SECRET_KEY = "";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { afterEach, test } = require("node:test");

const config = require("../src/config");
const paymentGateway = require("../src/services/paymentGateway");

const originalFetch = global.fetch;
const originalConfig = JSON.parse(JSON.stringify(config.payment));

afterEach(() => {
  global.fetch = originalFetch;
  Object.assign(config.payment.vnpay, originalConfig.vnpay);
  Object.assign(config.payment.momo, originalConfig.momo);
  config.payment.mockEnabled = originalConfig.mockEnabled;
});

function hmac(algorithm, secret, value) {
  return crypto.createHmac(algorithm, secret).update(value, "utf8").digest("hex");
}

test("custom webhook signatures bind timestamp and exact raw body", () => {
  const secret = "webhook-test-secret";
  const timestamp = String(Date.now());
  const rawPayload = '{"orderCode":"OD-1","status":"success"}';
  const signature = hmac("sha256", secret, `${timestamp}.${rawPayload}`);

  assert.equal(
    paymentGateway.verifyWebhookSignature({
      rawPayload,
      signature,
      timestamp,
      secret,
    }),
    true
  );
  assert.equal(
    paymentGateway.verifyWebhookSignature({
      rawPayload: `${rawPayload} `,
      signature,
      timestamp,
      secret,
    }),
    false
  );
  assert.equal(
    paymentGateway.verifyWebhookSignature({
      rawPayload,
      signature,
      timestamp: String(Date.now() - 10 * 60 * 1000),
      secret,
    }),
    false
  );
});

test("mock refunds are deterministic and completed", async () => {
  config.payment.mockEnabled = true;
  Object.assign(config.payment.vnpay, { tmnCode: "", hashSecret: "" });

  const input = {
    method: "VNPAY",
    providerOrderId: "VNPAY_OD-1_1",
    providerCreatedAt: new Date(),
    transactionId: "123",
    amount: 100_000,
    idempotencyKey: "refund:OD-1",
  };
  const first = await paymentGateway.requestRefund(input);
  const replay = await paymentGateway.requestRefund(input);

  assert.equal(first.ok, true);
  assert.equal(first.completed, true);
  assert.equal(replay.refundTransactionId, first.refundTransactionId);
});

test("MoMo refund uses the documented signed, idempotent request", async () => {
  Object.assign(config.payment.momo, {
    partnerCode: "MOMO_TEST",
    accessKey: "access-test",
    secretKey: "secret-test",
    refundEndpoint: "https://momo.test/refund",
  });
  let sent;
  global.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        resultCode: 0,
        message: "Successful",
        orderId: sent.orderId,
        transId: 987654321,
      }),
    };
  };

  const result = await paymentGateway.requestRefund({
    method: "MOMO",
    transactionId: "123456789",
    amount: 150_000,
    reason: "Customer cancellation",
    idempotencyKey: "refund:OD-MOMO",
  });
  const signedData =
    `accessKey=access-test&amount=${sent.amount}` +
    `&description=${sent.description}&orderId=${sent.orderId}` +
    `&partnerCode=MOMO_TEST&requestId=${sent.requestId}` +
    `&transId=${sent.transId}`;

  assert.equal(sent.signature, hmac("sha256", "secret-test", signedData));
  assert.equal(sent.orderId, sent.requestId);
  assert.equal(result.ok, true);
  assert.equal(result.completed, true);
  assert.equal(result.refundTransactionId, "987654321");
});

test("VNPay refund signs the documented field order and verifies its response", async () => {
  Object.assign(config.payment.vnpay, {
    tmnCode: "TESTCODE",
    hashSecret: "vnpay-test-secret",
    apiUrl: "https://vnpay.test/refund",
    refundIp: "203.0.113.10",
  });
  let sent;
  global.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    const response = {
      vnp_ResponseId: "response-1",
      vnp_Command: "refund",
      vnp_ResponseCode: "00",
      vnp_Message: "Success",
      vnp_TmnCode: "TESTCODE",
      vnp_TxnRef: sent.vnp_TxnRef,
      vnp_Amount: sent.vnp_Amount,
      vnp_BankCode: "NCB",
      vnp_PayDate: "20260718120000",
      vnp_TransactionNo: "998877",
      vnp_TransactionType: "02",
      vnp_TransactionStatus: "00",
      vnp_OrderInfo: sent.vnp_OrderInfo,
    };
    response.vnp_SecureHash = hmac(
      "sha512",
      "vnpay-test-secret",
      [
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
      ].map((field) => response[field] || "").join("|")
    );
    return { ok: true, json: async () => response };
  };

  const result = await paymentGateway.requestRefund({
    method: "VNPAY",
    providerOrderId: "VNPAY_OD-1_123",
    providerCreatedAt: new Date("2026-07-18T05:00:00.000Z"),
    transactionId: "112233",
    amount: 200_000,
    originalAmount: 200_000,
    reason: "Customer cancellation",
    idempotencyKey: "refund:OD-VNPAY",
  });
  const requestFields = [
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

  assert.equal(
    sent.vnp_SecureHash,
    hmac(
      "sha512",
      "vnpay-test-secret",
      requestFields.map((field) => sent[field] || "").join("|")
    )
  );
  assert.equal(sent.vnp_IpAddr, "203.0.113.10");
  assert.equal(result.ok, true);
  assert.equal(result.completed, true);
  assert.equal(result.refundTransactionId, "998877");
});

test("VNPay partial refunds use type 03", async () => {
  Object.assign(config.payment.vnpay, {
    tmnCode: "TESTCODE",
    hashSecret: "vnpay-test-secret",
    apiUrl: "https://vnpay.test/refund",
    refundIp: "203.0.113.10",
  });
  let sent;
  global.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    const response = {
      vnp_ResponseId: "response-partial",
      vnp_Command: "refund",
      vnp_ResponseCode: "00",
      vnp_Message: "Success",
      vnp_TmnCode: "TESTCODE",
      vnp_TxnRef: sent.vnp_TxnRef,
      vnp_Amount: sent.vnp_Amount,
      vnp_BankCode: "NCB",
      vnp_PayDate: "20260718120000",
      vnp_TransactionNo: "998878",
      vnp_TransactionType: sent.vnp_TransactionType,
      vnp_TransactionStatus: "00",
      vnp_OrderInfo: sent.vnp_OrderInfo,
    };
    response.vnp_SecureHash = hmac(
      "sha512",
      "vnpay-test-secret",
      [
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
      ].map((field) => response[field] || "").join("|")
    );
    return { ok: true, json: async () => response };
  };

  const result = await paymentGateway.requestRefund({
    method: "VNPAY",
    providerOrderId: "VNPAY_OD-2_123",
    providerCreatedAt: new Date("2026-07-18T05:00:00.000Z"),
    transactionId: "112234",
    amount: 50_000,
    originalAmount: 200_000,
    reason: "Partial return",
    idempotencyKey: "return:OD-VNPAY:1",
  });

  assert.equal(sent.vnp_TransactionType, "03");
  assert.equal(result.ok, true);
  assert.equal(result.completed, true);
});

test("VNPay query uses unique ids, query checksum fields, and refund identity", async () => {
  Object.assign(config.payment.vnpay, {
    tmnCode: "TESTCODE",
    hashSecret: "vnpay-test-secret",
    apiUrl: "https://vnpay.test/query",
    refundIp: "203.0.113.10",
  });
  const sentRequests = [];
  global.fetch = async (_url, options) => {
    const sent = JSON.parse(options.body);
    sentRequests.push(sent);
    const response = {
      vnp_ResponseId: `query-response-${sentRequests.length}`,
      vnp_Command: "querydr",
      vnp_ResponseCode: "00",
      vnp_Message: "Success",
      vnp_TmnCode: "TESTCODE",
      vnp_TxnRef: sent.vnp_TxnRef,
      vnp_Amount: 5_000_000,
      vnp_BankCode: "NCB",
      vnp_PayDate: "20260718120000",
      vnp_TransactionNo: "998879",
      vnp_TransactionType: "03",
      vnp_TransactionStatus: "00",
      vnp_OrderInfo: sent.vnp_OrderInfo,
      vnp_PromotionCode: "PROMO1",
      vnp_PromotionAmount: "100000",
    };
    response.vnp_SecureHash = hmac(
      "sha512",
      "vnpay-test-secret",
      [
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
      ].map((field) => response[field] || "").join("|")
    );
    return { ok: true, json: async () => response };
  };

  const input = {
    method: "VNPAY",
    providerOrderId: "VNPAY_OD-3_123",
    providerCreatedAt: new Date("2026-07-18T05:00:00.000Z"),
    transactionId: "112235",
    amount: 50_000,
    originalAmount: 200_000,
    idempotencyKey: "return:OD-VNPAY:2",
    reason: "Query partial return",
  };
  const first = await paymentGateway.queryRefundStatus(input);
  const second = await paymentGateway.queryRefundStatus(input);

  assert.notEqual(sentRequests[0].vnp_RequestId, sentRequests[1].vnp_RequestId);
  assert.equal(first.ok, true);
  assert.equal(first.completed, true);
  assert.equal(second.ok, true);
});

test("VNPay query does not complete a mismatched refund", async () => {
  Object.assign(config.payment.vnpay, {
    tmnCode: "TESTCODE",
    hashSecret: "vnpay-test-secret",
    apiUrl: "https://vnpay.test/query",
    refundIp: "203.0.113.10",
  });
  global.fetch = async (_url, options) => {
    const sent = JSON.parse(options.body);
    const response = {
      vnp_ResponseId: "query-response-mismatch",
      vnp_Command: "querydr",
      vnp_ResponseCode: "00",
      vnp_Message: "Success",
      vnp_TmnCode: "TESTCODE",
      vnp_TxnRef: sent.vnp_TxnRef,
      vnp_Amount: 20_000_000,
      vnp_BankCode: "NCB",
      vnp_PayDate: "20260718120000",
      vnp_TransactionNo: "998880",
      vnp_TransactionType: "02",
      vnp_TransactionStatus: "00",
      vnp_OrderInfo: sent.vnp_OrderInfo,
      vnp_PromotionCode: "",
      vnp_PromotionAmount: "",
    };
    response.vnp_SecureHash = hmac(
      "sha512",
      "vnpay-test-secret",
      [
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
      ].map((field) => response[field] || "").join("|")
    );
    return { ok: true, json: async () => response };
  };

  const result = await paymentGateway.queryRefundStatus({
    method: "VNPAY",
    providerOrderId: "VNPAY_OD-4_123",
    providerCreatedAt: new Date("2026-07-18T05:00:00.000Z"),
    transactionId: "112236",
    amount: 50_000,
    originalAmount: 200_000,
    idempotencyKey: "return:OD-VNPAY:3",
  });

  assert.equal(result.ok, false);
  assert.equal(result.completed, undefined);
});
