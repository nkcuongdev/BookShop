process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";
process.env.PAYMENT_MOCK_ENABLED = "true";
process.env.PAYMENT_WEBHOOK_SECRET = "refund-recovery-webhook-secret";
process.env.VNPAY_TMN_CODE = "";
process.env.VNPAY_HASH_SECRET = "";

// R-A2: a refund the gateway reports as failed is resubmitted a bounded number
// of times with backoff, then handed to staff; references already used stay
// recognisable so a late success for an old one is recorded, not rejected.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Book = require("../src/models/Book");
const Notification = require("../src/models/Notification");
const Order = require("../src/models/Order");
const ReturnRequest = require("../src/models/ReturnRequest");
const User = require("../src/models/User");
const orderService = require("../src/services/orderService");
const paymentGateway = require("../src/services/paymentGateway");
const returnRequestService = require("../src/services/returnRequestService");

let replicaSet;
let userId;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Book.syncIndexes(), Order.syncIndexes(), User.syncIndexes()]);
});

after(async () => {
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
  const user = await User.create({
    name: "Refund Recovery",
    email: "refund-recovery@example.com",
    password: "secure-password",
    emailVerifiedAt: new Date(),
  });
  userId = user._id;
});

function mockGateway(t, { request, query }) {
  const calls = { request: [], query: 0 };
  t.mock.method(paymentGateway, "requestRefund", async (payload) => {
    calls.request.push(payload.idempotencyKey);
    return request(calls.request.length, payload);
  });
  t.mock.method(paymentGateway, "queryRefundStatus", async (payload) => {
    calls.query += 1;
    return query(calls.query, payload);
  });
  return calls;
}

async function refundingOrder() {
  const book = await Book.create({
    title: "Refund Book",
    author: "Author",
    category: "Testing",
    price: 100_000,
    stock: 10,
    status: "active",
  });
  const { order } = await orderService.createOrder({
    userId,
    items: [{ bookId: String(book._id), quantity: 2 }],
    shippingAddress: { fullName: "Refund Recovery", phone: "0900000000", address: "1 Test Street" },
    paymentMethod: "VNPAY",
    idempotencyKey: `refund-recovery-${new mongoose.Types.ObjectId()}`,
  });
  await orderService.handlePaymentSuccess({
    orderCode: order.orderCode,
    method: "VNPAY",
    providerOrderId: order.payment.providerOrderId,
    transactionId: "captured-payment",
    amount: order.totalAmount,
    rawPayload: {},
  });
  return { order, book };
}

const makeOrderRefundDue = (orderId) =>
  Order.updateOne({ _id: orderId }, { $set: { "payment.refundNextRetryAt": new Date(0) } });

test("R-A2 order: a refund that keeps failing stops after the submission cap and alerts staff", async (t) => {
  const { order, book } = await refundingOrder();
  const calls = mockGateway(t, {
    request: (n) => ({ ok: true, completed: false, refundTransactionId: `order-refund-${n}` }),
    query: () => ({ ok: true, completed: false, failed: true, status: "02" }),
  });
  await orderService.cancelOrder(order._id, userId, "test");
  assert.equal(calls.request.length, 1);

  for (let pass = 0; pass < 10; pass += 1) {
    await makeOrderRefundDue(order._id);
    await orderService.reconcilePendingRefunds();
  }

  assert.equal(calls.request.length, 3, "three submissions, then staff take over");
  assert.equal(new Set(calls.request).size, 3, "each submission used a fresh key");
  const stored = await Order.findById(order._id).select("+payment.refundLastError +payment.refundHistory");
  assert.equal(stored.status, Order.STATUS.REFUNDING);
  assert.equal(stored.payment.refundManualRequired, true);
  assert.deepEqual(
    stored.payment.refundHistory.map((entry) => entry.refundTransactionId),
    ["order-refund-1", "order-refund-2", "order-refund-3"]
  );
  assert.ok(await Notification.exists({ role: "admin", type: "refund" }));
  assert.equal((await Book.findById(book._id)).stock, 8, "nothing was refunded, stock stays held");
});

test("R-A2 order: a late success for an earlier refund reference is recorded without resubmitting", async (t) => {
  const { order, book } = await refundingOrder();
  const calls = mockGateway(t, {
    request: (n) => ({ ok: true, completed: false, refundTransactionId: `late-refund-${n}` }),
    // Only the first refund is reported failed; the replacement stays pending.
    query: (_n, payload) =>
      payload.idempotencyKey.startsWith("refund:")
        ? { ok: true, completed: false, failed: true, status: "02" }
        : { ok: true, completed: false, failed: false, status: "01" },
  });
  await orderService.cancelOrder(order._id, userId, "test");
  await makeOrderRefundDue(order._id);
  await orderService.reconcilePendingRefunds(); // late-refund-1 reported failed, re-armed
  await makeOrderRefundDue(order._id);
  await orderService.reconcilePendingRefunds(); // late-refund-2 submitted
  assert.equal(calls.request.length, 2);

  // The bank actually paid the first refund after all.
  const payload = { orderCode: order.orderCode, status: "success", refundTransactionId: "late-refund-1" };
  const raw = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  const response = await supertest(app)
    .post("/api/orders/webhook/refund")
    .set("Content-Type", "application/json")
    .set("x-signature", signature)
    .set("x-webhook-timestamp", timestamp)
    .send(raw);
  assert.equal(response.status, 200, JSON.stringify(response.body));

  const stored = await Order.findById(order._id);
  assert.equal(stored.status, Order.STATUS.REFUNDED);
  assert.equal(stored.payment.refundTransactionId, "late-refund-1");
  assert.equal((await Book.findById(book._id)).stock, 10);
  // The still-open second refund is flagged so staff can stop a double payout.
  assert.ok(await Notification.exists({ role: "admin", type: "refund" }));

  for (let pass = 0; pass < 3; pass += 1) {
    await makeOrderRefundDue(order._id);
    await orderService.reconcilePendingRefunds();
  }
  assert.equal(calls.request.length, 2, "no further refund is submitted");
});

async function receivedReturnWithPendingRefund() {
  const customer = await User.findById(userId);
  const order = await Order.create({
    user: customer._id,
    items: [{ book: new mongoose.Types.ObjectId(), title: "Return Book", price: 90_000, quantity: 1, subtotal: 90_000 }],
    subtotal: 90_000,
    totalAmount: 90_000,
    status: Order.STATUS.DELIVERED,
    deliveredAt: new Date(),
    shippingAddress: { fullName: "Refund Recovery", phone: "0900000000", address: "1 Test Street" },
    payment: { method: "VNPAY", status: "PAID", transactionId: "return-capture", providerOrderId: "return-provider" },
    supportCompensation: { refundedAmount: 0, reservedRefundAmount: 90_000 },
  });
  const requestId = new mongoose.Types.ObjectId();
  await ReturnRequest.create({
    _id: requestId,
    order: order._id,
    user: customer._id,
    items: [{ book: order.items[0].book, title: "Return Book", unitPrice: 90_000, orderedQuantity: 1, quantity: 1 }],
    reason: "DAMAGED",
    details: "Sách bị rách nhiều trang khi mở kiện hàng.",
    status: "RECEIVED",
    expectedRefundAmount: 90_000,
    refund: {
      status: "PENDING",
      amount: 90_000,
      idempotencyKey: `return-refund:${requestId}`,
      businessType: "RETURN",
      sourceId: String(requestId),
      paymentMethod: "VNPAY",
      originalPaymentTransactionId: "return-capture",
      originalProviderOrderId: "return-provider",
      nextRetryAt: new Date(0),
    },
  });
  return { order, requestId };
}

const makeReturnRefundDue = (requestId) =>
  ReturnRequest.updateOne({ _id: requestId }, { $set: { "refund.nextRetryAt": new Date(0) } });

test("R-A2 return: a refund that keeps failing goes to MANUAL_REQUIRED after the cap", async (t) => {
  const { requestId } = await receivedReturnWithPendingRefund();
  const calls = mockGateway(t, {
    request: (n) => ({ ok: true, completed: false, refundTransactionId: `return-refund-${n}` }),
    query: () => ({ ok: true, completed: false, failed: true, status: "02" }),
  });

  for (let pass = 0; pass < 10; pass += 1) {
    await makeReturnRefundDue(requestId);
    await returnRequestService.executeReturnRefund(requestId);
    await returnRequestService.reconcileProcessingRefunds();
  }

  assert.equal(calls.request.length, 3);
  const stored = await ReturnRequest.findById(requestId);
  assert.equal(stored.refund.status, "MANUAL_REQUIRED");
  assert.match(stored.refund.lastError, /02|thất bại|failed/i);
  assert.deepEqual(
    stored.refund.history.map((entry) => entry.transactionId),
    ["return-refund-1", "return-refund-2", "return-refund-3"]
  );
  assert.ok(await Notification.exists({ role: "admin", type: "refund" }));
});

test("R-A2 return: a late success for an earlier return refund closes the request", async (t) => {
  const { order, requestId } = await receivedReturnWithPendingRefund();
  const calls = mockGateway(t, {
    request: (n) => ({ ok: true, completed: false, refundTransactionId: `old-return-${n}` }),
    query: () => ({ ok: true, completed: false, failed: true, status: "02" }),
  });
  await returnRequestService.executeReturnRefund(requestId); // old-return-1 accepted
  await returnRequestService.reconcileProcessingRefunds(); // reported failed, re-armed
  await makeReturnRefundDue(requestId);
  await returnRequestService.executeReturnRefund(requestId); // old-return-2 accepted
  assert.equal(calls.request.length, 2);

  const result = await returnRequestService.completeReturnRefund({
    orderId: order._id,
    refundTransactionId: "old-return-1",
  });
  assert.equal(result.changed, true);
  const stored = await ReturnRequest.findById(requestId);
  assert.equal(stored.status, "CLOSED");
  assert.equal(stored.refund.transactionId, "old-return-1");
  const settled = await Order.findById(order._id).select("+supportCompensation.reservedRefundAmount");
  assert.equal(settled.supportCompensation.refundedAmount, 90_000);
  assert.equal(settled.supportCompensation.reservedRefundAmount, 0);
  assert.ok(await Notification.exists({ role: "admin", type: "refund" }));

  await makeReturnRefundDue(requestId);
  await returnRequestService.executeReturnRefund(requestId);
  assert.equal(calls.request.length, 2, "a closed request submits nothing more");
});

test("R-A2 duplicate capture: failures are capped and a settled attempt is never re-armed", async (t) => {
  const { order } = await refundingOrder();
  const reference = order.payment.providerOrderId;
  const settledReference = "settled-attempt";
  await Order.updateOne(
    { _id: order._id },
    {
      $push: {
        "payment.attempts": {
          providerOrderId: settledReference,
          method: "VNPAY",
          amount: order.totalAmount,
          status: "SUCCEEDED",
          duplicateRefund: { status: "REFUNDED", idempotencyKey: "settled-key", refundTransactionId: "settled-refund" },
        },
      },
    }
  );
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        "payment.attempts.$[attempt].duplicateRefund": {
          status: "PENDING",
          idempotencyKey: "dup-key-1",
          refundTransactionId: "dup-refund-1",
          nextRetryAt: new Date(0),
        },
      },
    },
    { arrayFilters: [{ "attempt.providerOrderId": reference }] }
  );
  const calls = mockGateway(t, {
    request: (n) => ({ ok: true, completed: false, refundTransactionId: `dup-refund-${n + 1}` }),
    query: () => ({ ok: true, completed: false, failed: true, status: "02" }),
  });
  const makeDue = () =>
    Order.updateOne(
      { _id: order._id },
      { $set: { "payment.attempts.$[attempt].duplicateRefund.nextRetryAt": new Date(0) } },
      { arrayFilters: [{ "attempt.providerOrderId": reference }] }
    );

  for (let pass = 0; pass < 10; pass += 1) {
    await makeDue();
    await orderService.executeDuplicatePaymentRefund(order._id, reference);
  }

  const stored = await Order.findById(order._id).select("+payment.attempts");
  const attempt = stored.payment.attempts.find((item) => item.providerOrderId === reference);
  const settled = stored.payment.attempts.find((item) => item.providerOrderId === settledReference);
  assert.equal(calls.request.length, 2, "first refund was already accepted; two resubmissions");
  assert.equal(attempt.duplicateRefund.manualRequired, true);
  assert.equal(attempt.duplicateRefund.history.length, 3);
  assert.equal(settled.duplicateRefund.status, "REFUNDED");
  assert.equal(settled.duplicateRefund.refundTransactionId, "settled-refund");
  assert.ok(await Notification.exists({ role: "admin", type: "refund" }));

  // A late success for the first reference is still recognised.
  assert.equal(await orderService.settleDuplicatePaymentRefund(order._id, "dup-refund-1"), true);
  const afterLate = await Order.findById(order._id).select("+payment.attempts");
  assert.equal(
    afterLate.payment.attempts.find((item) => item.providerOrderId === reference).duplicateRefund.status,
    "REFUNDED"
  );
});
