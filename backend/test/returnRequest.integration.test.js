process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Book = require("../src/models/Book");
const Notification = require("../src/models/Notification");
const Order = require("../src/models/Order");
const ReturnRequest = require("../src/models/ReturnRequest");
const UploadedAsset = require("../src/models/UploadedAsset");
const User = require("../src/models/User");
const paymentGateway = require("../src/services/paymentGateway");
const {
  executeReturnRefund,
  reconcileProcessingRefunds,
} = require("../src/services/returnRequestService");

let mongo;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Book.syncIndexes(),
    Order.syncIndexes(),
    ReturnRequest.syncIndexes(),
    UploadedAsset.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
});

async function sessionFor(user) {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(response.status, 200);
  return { agent, csrf: response.body.data.csrfToken };
}

function orderPayload(userId, overrides = {}) {
  const firstBook = new mongoose.Types.ObjectId();
  const secondBook = new mongoose.Types.ObjectId();
  return {
    user: userId,
    items: [
      {
        book: firstBook,
        title: "Dế Mèn Phiêu Lưu Ký",
        author: "Tô Hoài",
        price: 90_000,
        quantity: 2,
        subtotal: 180_000,
      },
      {
        book: secondBook,
        title: "Hoàng Tử Bé",
        author: "Antoine de Saint-Exupéry",
        price: 75_000,
        quantity: 1,
        subtotal: 75_000,
      },
    ],
    subtotal: 255_000,
    totalAmount: 255_000,
    shippingAddress: {
      fullName: "Return Customer",
      phone: "0900000000",
      address: "1 Test Street",
    },
    status: Order.STATUS.DELIVERED,
    deliveredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    payment: {
      method: Order.PAYMENT_METHOD.COD,
      status: Order.PAYMENT_STATUS.PAID,
    },
    ...overrides,
  };
}

function requestPayload(order, overrides = {}) {
  return {
    items: [{ bookId: String(order.items[0].book), quantity: 1 }],
    reason: "DAMAGED",
    details: "Sách bị rách nhiều trang khi mở kiện hàng.",
    ...overrides,
  };
}

test("customer can create multiple requests within the remaining line quantity", async () => {
  const customer = await User.create({
    name: "Return Customer",
    email: "return-customer@example.com",
    password: "secure-password",
  });
  const order = await Order.create(orderPayload(customer._id));
  const { agent, csrf } = await sessionFor(customer);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const uploaded = await agent
    .post(`/api/uploads/return-images?orderId=${order._id}`)
    .set("x-csrf-token", csrf)
    .attach("image", png, { filename: "return-evidence.png", contentType: "image/png" });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  const evidenceUrl = uploaded.body.data.image.url;
  const temporaryAsset = await UploadedAsset.findOne({ url: evidenceUrl });
  assert.equal(temporaryAsset.purpose, "return_request");
  assert.equal(temporaryAsset.status, "temporary");

  const created = await agent
    .post(`/api/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send(requestPayload(order, { images: [evidenceUrl] }));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.returnRequest.status, "PENDING");
  assert.equal(created.body.data.returnRequest.items[0].title, "Dế Mèn Phiêu Lưu Ký");
  assert.equal(created.body.data.returnRequest.items[0].orderedQuantity, 2);
  assert.deepEqual(created.body.data.returnRequest.images, [evidenceUrl]);
  assert.equal(created.body.data.returnEligibility.eligible, true);
  assert.equal(created.body.data.returnEligibility.remainingItems[0].quantity, 1);
  const attachedAsset = await UploadedAsset.findOne({ url: evidenceUrl });
  assert.equal(attachedAsset.status, "attached");
  assert.equal(attachedAsset.entityType, "return_request");
  assert.equal(
    String(attachedAsset.entityId),
    String(created.body.data.returnRequest._id)
  );

  const detail = await agent.get(`/api/orders/${order._id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.order.returnRequest.reason, "DAMAGED");
  assert.deepEqual(detail.body.data.order.returnRequest.images, [evidenceUrl]);
  assert.equal(detail.body.data.order.returnEligibility.code, "ELIGIBLE");
  assert.equal(await Notification.countDocuments({ role: "admin", type: "refund" }), 1);

  const secondRequest = await agent
    .post(`/api/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send(requestPayload(order));
  assert.equal(secondRequest.status, 201, JSON.stringify(secondRequest.body));
  assert.equal(await ReturnRequest.countDocuments({ order: order._id }), 2);

  const exhausted = await agent
    .post(`/api/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send(requestPayload(order));
  assert.equal(exhausted.status, 409);
  assert.equal(exhausted.body.code, "RETURN_QUANTITY_EXCEEDED");
});

test("return request rejects invalid ownership, quantity, state and expired window", async () => {
  const [owner, stranger] = await User.create([
    {
      name: "Owner",
      email: "return-owner@example.com",
      password: "secure-password",
    },
    {
      name: "Stranger",
      email: "return-stranger@example.com",
      password: "secure-password",
    },
  ]);
  const delivered = await Order.create(orderPayload(owner._id));
  const pending = await Order.create(
    orderPayload(owner._id, { status: Order.STATUS.PROCESSING, deliveredAt: null })
  );
  const expired = await Order.create(
    orderPayload(owner._id, {
      deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })
  );
  const ownerSession = await sessionFor(owner);
  const strangerSession = await sessionFor(stranger);

  const tooManyImages = await ownerSession.agent
    .post(`/api/orders/${delivered._id}/return-request`)
    .set("x-csrf-token", ownerSession.csrf)
    .send(requestPayload(delivered, { images: ["one", "two", "three", "four"] }));
  assert.equal(tooManyImages.status, 400);

  const forbiddenUpload = await strangerSession.agent
    .post(`/api/uploads/return-images?orderId=${delivered._id}`)
    .set("x-csrf-token", strangerSession.csrf)
    .attach("image", Buffer.from("not-read"), {
      filename: "evidence.png",
      contentType: "image/png",
    });
  assert.equal(forbiddenUpload.status, 404);

  const foreignAsset = await UploadedAsset.create({
    assetId: "foreign-return.webp",
    url: "https://images.example/foreign-return.webp",
    provider: "local",
    owner: stranger._id,
    purpose: "return_request",
    status: "temporary",
    expiresAt: new Date(Date.now() + 60_000),
  });
  const stolenImage = await ownerSession.agent
    .post(`/api/orders/${delivered._id}/return-request`)
    .set("x-csrf-token", ownerSession.csrf)
    .send(requestPayload(delivered, { images: [foreignAsset.url] }));
  assert.equal(stolenImage.status, 400);
  assert.equal((await UploadedAsset.findById(foreignAsset._id)).status, "temporary");

  const invalidQuantity = await ownerSession.agent
    .post(`/api/orders/${delivered._id}/return-request`)
    .set("x-csrf-token", ownerSession.csrf)
    .send(requestPayload(delivered, {
      items: [{ bookId: String(delivered.items[0].book), quantity: 3 }],
    }));
  assert.equal(invalidQuantity.status, 422);

  const wrongOwner = await strangerSession.agent
    .post(`/api/orders/${delivered._id}/return-request`)
    .set("x-csrf-token", strangerSession.csrf)
    .send(requestPayload(delivered));
  assert.equal(wrongOwner.status, 404);

  const wrongState = await ownerSession.agent
    .post(`/api/orders/${pending._id}/return-request`)
    .set("x-csrf-token", ownerSession.csrf)
    .send(requestPayload(pending));
  assert.equal(wrongState.status, 422);
  assert.equal(wrongState.body.code, "ORDER_NOT_DELIVERED");

  const outsideWindow = await ownerSession.agent
    .post(`/api/orders/${expired._id}/return-request`)
    .set("x-csrf-token", ownerSession.csrf)
    .send(requestPayload(expired, { reason: "OTHER" }));
  assert.equal(outsideWindow.status, 422);
  assert.equal(outsideWindow.body.code, "RETURN_WINDOW_EXPIRED");
});

test("admin discovers, approves or rejects a request exactly once", async () => {
  const [customer, admin] = await User.create([
    {
      name: "Return Customer",
      email: "return-review-customer@example.com",
      password: "secure-password",
    },
    {
      name: "Return Admin",
      email: "return-review-admin@example.com",
      password: "secure-password",
      role: "admin",
    },
  ]);
  const order = await Order.create(orderPayload(customer._id));
  await ReturnRequest.create({
    order: order._id,
    user: customer._id,
    items: [
      {
        book: order.items[1].book,
        title: order.items[1].title,
        author: order.items[1].author,
        unitPrice: order.items[1].price,
        orderedQuantity: 1,
        quantity: 1,
      },
    ],
    reason: "WRONG_ITEM",
    details: "Sản phẩm nhận được không đúng với đơn đã đặt.",
  });
  const { agent, csrf } = await sessionFor(admin);

  const queue = await agent.get("/api/admin/orders?returnStatus=PENDING");
  assert.equal(queue.status, 200);
  assert.equal(queue.body.data.orders.length, 1);
  assert.equal(queue.body.data.orders[0].returnRequest.status, "PENDING");
  assert.equal(queue.body.data.returnStatusCounts.PENDING, 1);

  const missingReason = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "REJECTED", adminNote: "" });
  assert.equal(missingReason.status, 422);

  const approved = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "APPROVED", adminNote: "Mang sản phẩm đến điểm tiếp nhận." });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.data.returnRequest.status, "RETURNING");
  assert.ok(approved.body.data.returnRequest.returnCode);
  assert.ok(approved.body.data.returnRequest.resolvedAt);
  assert.equal((await Order.findById(order._id)).status, Order.STATUS.DELIVERED);

  const secondResolution = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "REJECTED", adminNote: "Đã xử lý trước đó" });
  assert.equal(secondResolution.status, 409);
  assert.equal(
    await Notification.countDocuments({ user: customer._id, type: "refund" }),
    1
  );
});

test("receiving a partial COD return adjusts inventory once and requires a manual refund reference", async () => {
  const [customer, admin] = await User.create([
    {
      name: "Lifecycle Customer",
      email: "return-lifecycle-customer@example.com",
      password: "secure-password",
    },
    {
      name: "Lifecycle Admin",
      email: "return-lifecycle-admin@example.com",
      password: "secure-password",
      role: "admin",
    },
  ]);
  const [firstBook, secondBook] = await Book.create([
    { title: "First", author: "Author", category: "Test", price: 100_000, stock: 3, sold: 10 },
    { title: "Second", author: "Author", category: "Test", price: 50_000, stock: 5, sold: 4 },
  ]);
  const order = await Order.create(orderPayload(customer._id, {
    items: [
      { book: firstBook._id, title: firstBook.title, author: firstBook.author, price: 100_000, quantity: 2, subtotal: 200_000 },
      { book: secondBook._id, title: secondBook.title, author: secondBook.author, price: 50_000, quantity: 1, subtotal: 50_000 },
    ],
    subtotal: 250_000,
    discountAmount: 25_000,
    shippingFee: 15_000,
    totalAmount: 240_000,
  }));
  await ReturnRequest.create({
    order: order._id,
    user: customer._id,
    items: [{
      book: firstBook._id,
      title: firstBook.title,
      author: firstBook.author,
      unitPrice: 100_000,
      orderedQuantity: 2,
      quantity: 1,
    }],
    reason: "DAMAGED",
    details: "Sản phẩm bị hư hỏng khi nhận hàng.",
  });
  const { agent, csrf } = await sessionFor(admin);

  const approved = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "APPROVED", adminNote: "Gửi về kho trung tâm." });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));

  const received = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "RECEIVED", restock: true });
  assert.equal(received.status, 200, JSON.stringify(received.body));
  assert.equal(received.body.data.returnRequest.status, "RECEIVED");
  assert.equal(received.body.data.returnRequest.expectedRefundAmount, 90_000);
  assert.equal(received.body.data.returnRequest.refund.status, "MANUAL_REQUIRED");
  const inventory = await Book.findById(firstBook._id);
  assert.equal(inventory.stock, 4);
  assert.equal(inventory.sold, 9);

  const duplicateReceipt = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "RECEIVED", restock: true });
  assert.equal(duplicateReceipt.status, 409);
  const inventoryAfterRetry = await Book.findById(firstBook._id);
  assert.equal(inventoryAfterRetry.stock, 4);
  assert.equal(inventoryAfterRetry.sold, 9);

  const missingReference = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "CLOSED", refundTransactionId: "" });
  assert.equal(missingReference.status, 422);

  const closed = await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "CLOSED", refundTransactionId: "BANK-RETURN-001" });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.data.returnRequest.status, "CLOSED");
  assert.equal(closed.body.data.returnRequest.refund.transactionId, "BANK-RETURN-001");
});

test("online return refund retries with the same key and closes without another stock adjustment", async () => {
  const [customer, admin] = await User.create([
    { name: "Online Return", email: "online-return@example.com", password: "secure-password" },
    { name: "Online Admin", email: "online-return-admin@example.com", password: "secure-password", role: "admin" },
  ]);
  const book = await Book.create({
    title: "Online Book",
    author: "Author",
    category: "Test",
    price: 120_000,
    stock: 2,
    sold: 6,
  });
  const order = await Order.create(orderPayload(customer._id, {
    items: [{
      book: book._id,
      title: book.title,
      author: book.author,
      price: 120_000,
      quantity: 2,
      subtotal: 240_000,
    }],
    subtotal: 240_000,
    discountAmount: 20_000,
    shippingFee: 10_000,
    totalAmount: 230_000,
    payment: {
      method: Order.PAYMENT_METHOD.VNPAY,
      status: Order.PAYMENT_STATUS.PAID,
      transactionId: "VNPAY-CAPTURE-1",
      providerOrderId: "ORDER-REF-1",
      providerCreatedAt: new Date(),
    },
  }));
  await ReturnRequest.create({
    order: order._id,
    user: customer._id,
    items: [{
      book: book._id,
      title: book.title,
      author: book.author,
      unitPrice: 120_000,
      orderedQuantity: 2,
      quantity: 1,
    }],
    reason: "QUALITY_ISSUE",
    details: "Chất lượng sản phẩm không đúng như mô tả.",
  });
  const { agent, csrf } = await sessionFor(admin);
  await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "APPROVED", adminNote: "Gửi hàng về kho." });

  const originalRequestRefund = paymentGateway.requestRefund;
  const attempts = [];
  paymentGateway.requestRefund = async (payload) => {
    attempts.push(payload);
    if (attempts.length === 1) return { ok: false, error: "temporary gateway error" };
    return { ok: true, completed: true, refundTransactionId: "RF-ONLINE-1" };
  };
  try {
    const received = await agent
      .patch(`/api/admin/orders/${order._id}/return-request`)
      .set("x-csrf-token", csrf)
      .send({ status: "RECEIVED", restock: true });
    assert.equal(received.status, 200, JSON.stringify(received.body));
    assert.equal(received.body.data.returnRequest.status, "RECEIVED");
    assert.equal(received.body.data.returnRequest.refund.amount, 110_000);
    assert.match(received.body.data.returnRequest.refund.lastError, /temporary gateway error/);

    const request = await ReturnRequest.findOne({ order: order._id });
    await ReturnRequest.updateOne(
      { _id: request._id },
      { $set: { "refund.nextRetryAt": new Date(0) } }
    );
    const retried = await executeReturnRefund(request._id);
    assert.equal(retried.completed, true);
    const closed = await ReturnRequest.findById(request._id);
    assert.equal(closed.status, "CLOSED");
    assert.equal(closed.refund.transactionId, "RF-ONLINE-1");
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].idempotencyKey, attempts[1].idempotencyKey);
    assert.equal(attempts[0].amount, 110_000);
    const inventory = await Book.findById(book._id);
    assert.equal(inventory.stock, 3);
    assert.equal(inventory.sold, 5);
  } finally {
    paymentGateway.requestRefund = originalRequestRefund;
  }
});

test("a refund the gateway has not settled waits, then closes when it confirms", async () => {
  const [customer, admin] = await User.create([
    { name: "Pending Refund", email: "pending-refund@example.com", password: "secure-password" },
    { name: "Pending Admin", email: "pending-refund-admin@example.com", password: "secure-password", role: "admin" },
  ]);
  const book = await Book.create({
    title: "Pending Book",
    author: "Author",
    category: "Test",
    price: 200_000,
    stock: 1,
    sold: 3,
  });
  const order = await Order.create(orderPayload(customer._id, {
    items: [{
      book: book._id,
      title: book.title,
      author: book.author,
      price: 200_000,
      quantity: 1,
      subtotal: 200_000,
    }],
    subtotal: 200_000,
    discountAmount: 0,
    shippingFee: 0,
    totalAmount: 200_000,
    payment: {
      method: Order.PAYMENT_METHOD.VNPAY,
      status: Order.PAYMENT_STATUS.PAID,
      transactionId: "VNPAY-CAPTURE-2",
      providerOrderId: "ORDER-REF-2",
      providerCreatedAt: new Date(),
    },
  }));
  await ReturnRequest.create({
    order: order._id,
    user: customer._id,
    items: [{
      book: book._id,
      title: book.title,
      author: book.author,
      unitPrice: 200_000,
      orderedQuantity: 1,
      quantity: 1,
    }],
    reason: "QUALITY_ISSUE",
    details: "San pham khong dung mo ta nen yeu cau tra lai.",
  });
  const { agent, csrf } = await sessionFor(admin);
  await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "APPROVED", adminNote: "Gui hang ve kho." });

  const originalRequestRefund = paymentGateway.requestRefund;
  const originalQuery = paymentGateway.queryRefundStatus;
  // VNPay answers "instruction accepted" long before the money moves.
  paymentGateway.requestRefund = async () => ({
    ok: true,
    completed: false,
    refundTransactionId: "RF-PENDING-1",
  });
  try {
    await agent
      .patch(`/api/admin/orders/${order._id}/return-request`)
      .set("x-csrf-token", csrf)
      .send({ status: "RECEIVED", restock: true });

    // Nothing may be reported as refunded yet, and the order's refund headroom
    // stays held so a second refund cannot be approved against the same money.
    const inFlight = await ReturnRequest.findOne({ order: order._id });
    assert.equal(inFlight.status, "RECEIVED");
    assert.equal(inFlight.refund.status, "PROCESSING");
    assert.equal(inFlight.refund.completedAt, null);
    const heldOrder = await Order.findById(order._id).select(
      "+supportCompensation.reservedRefundAmount"
    );
    assert.equal(heldOrder.supportCompensation.refundedAmount, 0);
    assert.equal(heldOrder.supportCompensation.reservedRefundAmount, 200_000);

    // A lookup that errors is not evidence the refund failed: keep waiting.
    paymentGateway.queryRefundStatus = async () => {
      throw new Error("ECONNRESET");
    };
    const errored = await reconcileProcessingRefunds();
    assert.equal(errored.stillPending, 1);
    assert.equal(
      (await ReturnRequest.findById(inFlight._id)).refund.status,
      "PROCESSING"
    );

    // Still settling at the bank: also keep waiting.
    paymentGateway.queryRefundStatus = async () => ({
      ok: true,
      completed: false,
      failed: false,
      status: "01",
    });
    const pending = await reconcileProcessingRefunds();
    assert.equal(pending.stillPending, 1);
    assert.equal(pending.settled, 0);

    // The gateway confirms the money reached the customer.
    paymentGateway.queryRefundStatus = async () => ({
      ok: true,
      completed: true,
      failed: false,
      status: "00",
      refundTransactionId: "RF-PENDING-1",
    });
    const settled = await reconcileProcessingRefunds();
    assert.equal(settled.settled, 1);

    const closed = await ReturnRequest.findById(inFlight._id);
    assert.equal(closed.status, "CLOSED");
    assert.equal(closed.refund.status, "COMPLETED");
    assert.equal(closed.refund.transactionId, "RF-PENDING-1");

    // The held headroom becomes spent rather than staying blocked.
    const finalOrder = await Order.findById(order._id).select(
      "+supportCompensation.reservedRefundAmount"
    );
    assert.equal(finalOrder.supportCompensation.refundedAmount, 200_000);
    assert.equal(finalOrder.supportCompensation.reservedRefundAmount, 0);

    // Replaying the pass must not double-settle.
    const replay = await reconcileProcessingRefunds();
    assert.equal(replay.processed, 0);
  } finally {
    paymentGateway.requestRefund = originalRequestRefund;
    paymentGateway.queryRefundStatus = originalQuery;
  }
});

test("a refund the gateway rejects outright goes back to the retry queue", async () => {
  const [customer, admin] = await User.create([
    { name: "Failed Refund", email: "failed-refund@example.com", password: "secure-password" },
    { name: "Failed Admin", email: "failed-refund-admin@example.com", password: "secure-password", role: "admin" },
  ]);
  const book = await Book.create({
    title: "Failed Book",
    author: "Author",
    category: "Test",
    price: 150_000,
    stock: 1,
    sold: 2,
  });
  const order = await Order.create(orderPayload(customer._id, {
    items: [{
      book: book._id,
      title: book.title,
      author: book.author,
      price: 150_000,
      quantity: 1,
      subtotal: 150_000,
    }],
    subtotal: 150_000,
    discountAmount: 0,
    shippingFee: 0,
    totalAmount: 150_000,
    payment: {
      method: Order.PAYMENT_METHOD.VNPAY,
      status: Order.PAYMENT_STATUS.PAID,
      transactionId: "VNPAY-CAPTURE-3",
      providerOrderId: "ORDER-REF-3",
      providerCreatedAt: new Date(),
    },
  }));
  await ReturnRequest.create({
    order: order._id,
    user: customer._id,
    items: [{
      book: book._id,
      title: book.title,
      author: book.author,
      unitPrice: 150_000,
      orderedQuantity: 1,
      quantity: 1,
    }],
    reason: "QUALITY_ISSUE",
    details: "Hang loi, khach yeu cau tra lai san pham.",
  });
  const { agent, csrf } = await sessionFor(admin);
  await agent
    .patch(`/api/admin/orders/${order._id}/return-request`)
    .set("x-csrf-token", csrf)
    .send({ status: "APPROVED", adminNote: "Gui hang ve kho." });

  const originalRequestRefund = paymentGateway.requestRefund;
  const originalQuery = paymentGateway.queryRefundStatus;
  paymentGateway.requestRefund = async () => ({
    ok: true,
    completed: false,
    refundTransactionId: "RF-FAILED-1",
  });
  try {
    await agent
      .patch(`/api/admin/orders/${order._id}/return-request`)
      .set("x-csrf-token", csrf)
      .send({ status: "RECEIVED", restock: true });

    paymentGateway.queryRefundStatus = async () => ({
      ok: true,
      completed: false,
      failed: true,
      status: "99",
      error: "Bank rejected the refund",
    });
    const result = await reconcileProcessingRefunds();
    assert.equal(result.failed, 1);

    // Queued for another attempt rather than written off, and the money stays
    // reserved because the customer is still owed it.
    const request = await ReturnRequest.findOne({ order: order._id });
    assert.equal(request.refund.status, "PENDING");
    assert.match(request.refund.lastError, /Bank rejected/);
    const stillHeld = await Order.findById(order._id).select(
      "+supportCompensation.reservedRefundAmount"
    );
    assert.equal(stillHeld.supportCompensation.refundedAmount, 0);
    assert.equal(stillHeld.supportCompensation.reservedRefundAmount, 150_000);
  } finally {
    paymentGateway.requestRefund = originalRequestRefund;
    paymentGateway.queryRefundStatus = originalQuery;
  }
});
