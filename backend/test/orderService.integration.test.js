process.env.NODE_ENV = "test";
process.env.PAYMENT_MOCK_ENABLED = "true";
process.env.VNPAY_TMN_CODE = "";
process.env.VNPAY_HASH_SECRET = "";
process.env.MOMO_PARTNER_CODE = "";
process.env.MOMO_ACCESS_KEY = "";
process.env.MOMO_SECRET_KEY = "";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const config = require("../src/config");

const Book = require("../src/models/Book");
const Cart = require("../src/models/Cart");
const Order = require("../src/models/Order");
const OrderOutboxEvent = require("../src/models/OrderOutboxEvent");
const Notification = require("../src/models/Notification");
const User = require("../src/models/User");
const Voucher = require("../src/models/Voucher");
const VoucherRedemption = require("../src/models/VoucherRedemption");
const orderService = require("../src/services/orderService");
const paymentGateway = require("../src/services/paymentGateway");
const shippingService = require("../src/services/shippingService");
const orderCancellationService = require("../src/services/orderCancellationService");
const { migrateReservedStock } = require("../src/jobs/orderTTL");

let replicaSet;
let userId;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([
    Book.syncIndexes(),
    Order.syncIndexes(),
    OrderOutboxEvent.syncIndexes(),
    User.syncIndexes(),
    VoucherRedemption.syncIndexes(),
  ]);
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
    name: "Order Test User",
    email: "order-test@example.com",
    password: "secure-password",
    emailVerifiedAt: new Date(),
  });
  userId = user._id;
});

async function createBook(overrides = {}) {
  return Book.create({
    title: "Atomic Book",
    author: "Test Author",
    category: "Testing",
    price: 100_000,
    stock: 10,
    status: "active",
    ...overrides,
  });
}

async function createVoucher(overrides = {}) {
  return Voucher.create({
    code: `TEST${new mongoose.Types.ObjectId().toString().slice(-8)}`,
    type: "fixed",
    value: 10_000,
    minOrder: 0,
    startAt: new Date(Date.now() - 60_000),
    endAt: new Date(Date.now() + 60 * 60 * 1000),
    usageLimit: 10,
    ...overrides,
  });
}

function orderInput(book, overrides = {}) {
  return {
    userId,
    items: [{ bookId: book._id.toString(), quantity: 2 }],
    shippingAddress: {
      fullName: "Test Customer",
      phone: "0900000000",
      address: "1 Test Street",
    },
    paymentMethod: "COD",
    idempotencyKey: `checkout-${new mongoose.Types.ObjectId()}`,
    ...overrides,
  };
}

test("checkout snapshots the book's cost price onto each order item", async () => {
  const book = await createBook({ costPrice: 62_000 });

  const { order } = await orderService.createOrder(orderInput(book));

  const stored = await Order.findById(order.id).lean();
  assert.equal(stored.items[0].costPrice, 62_000);

  // A later cost change must not rewrite the margin already booked.
  await Book.updateOne({ _id: book._id }, { $set: { costPrice: 95_000 } });
  const unchanged = await Order.findById(order.id).lean();
  assert.equal(unchanged.items[0].costPrice, 62_000);
});

test("checkout replay returns one order and decrements stock once", async () => {
  const book = await createBook();
  const input = orderInput(book, { idempotencyKey: "checkout-replay-key" });

  const first = await orderService.createOrder(input);
  const replay = await orderService.createOrder(input);

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.id, first.order.id);
  assert.equal(await Order.countDocuments(), 1);
  assert.equal((await Book.findById(book._id)).stock, 8);

  await assert.rejects(
    orderService.createOrder({
      ...input,
      items: [{ bookId: book._id.toString(), quantity: 3 }],
    }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT"
  );
  assert.equal((await Book.findById(book._id)).stock, 8);
});

test("GHN delivered webhook advances the order once and preserves inventory totals", async () => {
  const book = await createBook({ weight: 400 });
  const created = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "ghn-webhook-delivered",
      authoritativeShipping: {
        method: "standard",
        fee: 32_000,
        snapshot: {
          provider: "ghn",
          quoteId: "ghn:type-2",
          serviceTypeId: 2,
          serviceName: "GHN Tiêu chuẩn",
          quotedAt: new Date(),
        },
      },
    })
  );
  await orderService.adminApproveOrder(created.order._id, "admin-test");
  await Order.updateOne(
    { _id: created.order._id },
    {
      $set: {
        carrier: "GHN",
        trackingNumber: "GHN-TRACK-1",
        "shipment.providerOrderCode": "GHN-TRACK-1",
        "shipment.providerStatus": "ready_to_pick",
      },
    }
  );

  const payload = {
    OrderCode: "GHN-TRACK-1",
    ClientOrderCode: created.order.orderCode,
    Status: "delivered",
    Type: "Switch_status",
    Description: "Giao hàng thành công",
    UpdatedDate: "2026-08-10T10:00:00.000Z",
  };
  const concurrent = await Promise.all([
    shippingService.syncGhnWebhook(payload),
    shippingService.syncGhnWebhook(payload),
  ]);
  const replay = await shippingService.syncGhnWebhook(payload);

  assert.ok(concurrent.every((result) => result.found));
  assert.deepEqual(
    concurrent.map((result) => result.duplicate).sort(),
    [false, true]
  );
  assert.deepEqual(replay, { found: true, duplicate: true });
  const order = await Order.findById(created.order._id);
  assert.equal(order.status, Order.STATUS.DELIVERED);
  assert.equal(order.shipment.providerStatus, "delivered");
  assert.equal(
    order.history.filter((entry) => entry.to === Order.STATUS.SHIPPED).length,
    1
  );
  assert.equal(
    order.history.filter((entry) => entry.to === Order.STATUS.DELIVERED).length,
    1
  );
  assert.equal((await Book.findById(book._id)).sold, 2);
});

test("GHN webhook state is verified against the provider before transition", async () => {
  const book = await createBook({ weight: 400 });
  const created = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "ghn-verified-webhook",
      authoritativeShipping: {
        method: "standard",
        fee: 32_000,
        snapshot: {
          provider: "ghn",
          quoteId: "ghn:type-2",
          serviceTypeId: 2,
          serviceName: "GHN Standard",
          quotedAt: new Date(),
        },
      },
    })
  );
  await orderService.adminApproveOrder(created.order._id, "admin-test");
  await Order.updateOne(
    { _id: created.order._id },
    {
      $set: {
        trackingNumber: "GHN-VERIFIED-1",
        "shipment.providerOrderCode": "GHN-VERIFIED-1",
        "shipment.providerStatus": "ready_to_pick",
      },
    }
  );

  const originalFetch = global.fetch;
  const originalGhn = { ...config.shipping.ghn };
  let providerStatus = "ready_to_pick";
  Object.assign(config.shipping.ghn, {
    enabled: true,
    token: "ghn-test-token",
    shopId: 12345,
  });
  global.fetch = async (_url, options) => {
    assert.equal(options.headers.Token, "ghn-test-token");
    assert.deepEqual(JSON.parse(options.body), {
      client_order_code: created.order.orderCode,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          order_code: "GHN-VERIFIED-1",
          client_order_code: created.order.orderCode,
          shop_id: 12345,
          status: providerStatus,
          updated_date: `2026-08-11T01:0${
            providerStatus === "delivered" ? "1" : "0"
          }:00.000Z`,
        },
      }),
    };
  };

  try {
    await assert.rejects(
      shippingService.verifyGhnWebhook({
        OrderCode: "GHN-VERIFIED-1",
        ClientOrderCode: "OD-WRONG",
        Status: "delivered",
      }),
      (error) => error.code === "GHN_WEBHOOK_ORDER_MISMATCH"
    );

    const untrustedDelivered = await shippingService.verifyGhnWebhook({
      OrderCode: "GHN-VERIFIED-1",
      ClientOrderCode: created.order.orderCode,
      Status: "delivered",
    });
    assert.equal(untrustedDelivered.Status, "ready_to_pick");
    await shippingService.syncGhnWebhook(untrustedDelivered);
    assert.equal(
      (await Order.findById(created.order._id)).status,
      Order.STATUS.PROCESSING
    );

    providerStatus = "delivered";
    const verifiedDelivered = await shippingService.verifyGhnWebhook({
      OrderCode: "GHN-VERIFIED-1",
      ClientOrderCode: created.order.orderCode,
      Status: "ready_to_pick",
    });
    await shippingService.syncGhnWebhook(verifiedDelivered);
    assert.equal(
      (await Order.findById(created.order._id)).status,
      Order.STATUS.DELIVERED
    );
  } finally {
    global.fetch = originalFetch;
    Object.assign(config.shipping.ghn, originalGhn);
  }
});

test("GHN Sandbox simulation advances a test shipment through delivery", async () => {
  const book = await createBook({ weight: 400 });
  const created = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "ghn-sandbox-simulation",
      authoritativeShipping: {
        method: "standard",
        fee: 21_000,
        snapshot: {
          provider: "ghn",
          environment: "sandbox",
          quoteId: "ghn:type-2",
          serviceTypeId: 2,
          serviceName: "GHN Sandbox Hàng nhẹ",
          quotedAt: new Date(),
        },
      },
    })
  );
  await orderService.adminApproveOrder(created.order._id, "admin-test");
  await Order.updateOne(
    { _id: created.order._id },
    {
      $set: {
        carrier: "GHN Sandbox",
        trackingNumber: "SANDBOX-TRACK-1",
        "shipment.environment": "sandbox",
        "shipment.providerOrderCode": "SANDBOX-TRACK-1",
        "shipment.providerStatus": "ready_to_pick",
        "shipment.simulation.enabled": true,
        "shipment.simulation.step": 0,
        "shipment.simulation.nextAt": new Date(0),
      },
    }
  );

  const workerResult = await shippingService.processDueSandboxSimulations();
  assert.deepEqual(workerResult, { processed: 1, failed: 0 });

  for (let index = 1; index < shippingService.SANDBOX_SIMULATION_STEPS.length; index += 1) {
    const result = await shippingService.advanceSandboxSimulation(
      created.order._id,
      { force: true, now: new Date(Date.now() + index * 1_000) }
    );
    assert.equal(result.advanced, true);
  }

  const order = await Order.findById(created.order._id);
  assert.equal(order.status, Order.STATUS.DELIVERED);
  assert.equal(order.shipment.providerStatus, "delivered");
  assert.equal(order.shipment.simulation.enabled, false);
  assert.ok(order.shipment.simulation.completedAt);
  assert.equal(
    order.trackingEvents.filter((event) =>
      event.description.startsWith("[Mô phỏng]")
    ).length,
    shippingService.SANDBOX_SIMULATION_STEPS.length
  );
});

test("online payment creation runs only after the order transaction commits", async () => {
  const book = await createBook();
  const originalCreatePaymentUrl = paymentGateway.createPaymentUrl;
  let committedOrderSeen = false;
  paymentGateway.createPaymentUrl = async ({ orderCode, transactionId }) => {
    const visibleOrder = await Order.findOne({ orderCode }).select(
      "+payment.retryLockUntil"
    );
    committedOrderSeen = Boolean(visibleOrder);
    assert.equal(visibleOrder?.payment.providerOrderId, transactionId);
    assert.ok(visibleOrder?.payment.retryLockUntil);
    return {
      paymentUrl: `https://gateway.test/${transactionId}`,
      transactionId,
    };
  };

  try {
    const result = await orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "post-commit-payment-key",
        paymentMethod: "VNPAY",
      })
    );
    assert.equal(committedOrderSeen, true);
    assert.match(result.paymentUrl, /^https:\/\/gateway\.test\//);
    assert.equal(result.order.payment.checkoutUrl, result.paymentUrl);
  } finally {
    paymentGateway.createPaymentUrl = originalCreatePaymentUrl;
  }
});

test("failed multi-book checkout rolls back every stock decrement", async () => {
  const available = await createBook({ title: "Available", stock: 5 });
  const unavailable = await createBook({ title: "Unavailable", stock: 0 });

  await assert.rejects(
    orderService.createOrder(
      orderInput(available, {
        idempotencyKey: "checkout-rollback-key",
        items: [
          { bookId: available._id.toString(), quantity: 2 },
          { bookId: unavailable._id.toString(), quantity: 1 },
        ],
      })
    ),
    /Kh|hàng|stock|enough/i
  );

  assert.equal((await Book.findById(available._id)).stock, 5);
  assert.equal(await Order.countDocuments(), 0);
});

test("concurrent cancellation restores stock at most once", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(orderInput(book));

  const attempts = await Promise.allSettled([
    orderService.cancelOrder(order._id, userId, "test"),
    orderService.cancelOrder(order._id, userId, "test"),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal((await Order.findById(order._id)).status, "CANCELLED");
  assert.equal((await Book.findById(book._id)).stock, 10);
});

test("shipment cancellation stays retryable until provider cancel and order finalization succeed", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, { idempotencyKey: "shipment-cancel-outbox-key" })
  );
  const adminId = new mongoose.Types.ObjectId();
  await orderService.adminApproveOrder(order._id, adminId);
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        "shipment.provider": "ghn",
        "shipment.environment": "sandbox",
        "shipment.providerOrderCode": "GHN-CANCEL-001",
        "shipment.providerStatus": "ready_to_pick",
      },
    }
  );

  const requested = await orderCancellationService.requestCustomerCancellation(
    order._id,
    userId,
    "Changed my mind",
    "127.0.0.1"
  );
  assert.equal(requested.order.status, Order.STATUS.CANCELLING);
  assert.equal((await Book.findById(book._id)).stock, 8);

  const originalCancel = shippingService.cancelGhnShipmentAtProvider;
  shippingService.cancelGhnShipmentAtProvider = async () => {
    throw new Error("provider temporarily unavailable");
  };
  try {
    const failed = await orderCancellationService.processOne({
      eventId: requested.event._id,
    });
    assert.equal(failed.completed, false);
  } finally {
    shippingService.cancelGhnShipmentAtProvider = originalCancel;
  }

  let persistedOrder = await Order.findById(order._id);
  let persistedEvent = await OrderOutboxEvent.findById(requested.event._id);
  assert.equal(persistedOrder.status, Order.STATUS.CANCELLING);
  assert.equal(persistedEvent.status, OrderOutboxEvent.STATUS.PENDING);
  assert.match(persistedEvent.lastError, /temporarily unavailable/);
  assert.equal((await Book.findById(book._id)).stock, 8);

  await OrderOutboxEvent.updateOne(
    { _id: requested.event._id },
    { $set: { nextAttemptAt: new Date(0) } }
  );
  shippingService.cancelGhnShipmentAtProvider = async () => true;
  try {
    const completed = await orderCancellationService.processOne({
      eventId: requested.event._id,
    });
    assert.equal(completed.completed, true);
  } finally {
    shippingService.cancelGhnShipmentAtProvider = originalCancel;
  }

  persistedOrder = await Order.findById(order._id);
  persistedEvent = await OrderOutboxEvent.findById(requested.event._id);
  assert.equal(persistedOrder.status, Order.STATUS.CANCELLED);
  assert.equal(persistedOrder.shipment.providerStatus, "cancel");
  assert.ok(persistedOrder.shipment.cancelledAt);
  assert.equal(persistedEvent.status, OrderOutboxEvent.STATUS.COMPLETED);
  assert.equal((await Book.findById(book._id)).stock, 10);
});

test("concurrent delivery increments sold at most once", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(orderInput(book));
  const adminId = new mongoose.Types.ObjectId();
  await orderService.adminApproveOrder(order._id, adminId);
  await orderService.adminMarkShipped(order._id, adminId);

  const attempts = await Promise.allSettled([
    orderService.adminMarkDelivered(order._id, adminId),
    orderService.adminMarkDelivered(order._id, adminId),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal((await Order.findById(order._id)).status, "DELIVERED");
  const updatedBook = await Book.findById(book._id);
  assert.equal(updatedBook.stock, 8);
  assert.equal(updatedBook.sold, 2);
  assert.equal(
    await Notification.countDocuments({ user: userId, type: "review" }),
    1
  );
});

test("reservedStock migration is safe when two app instances run it", async () => {
  const book = await createBook({ stock: 7 });
  await Book.collection.updateOne(
    { _id: book._id },
    { $set: { reservedStock: 3 } }
  );

  await Promise.all([migrateReservedStock(), migrateReservedStock()]);

  const migrated = await Book.collection.findOne({ _id: book._id });
  assert.equal(migrated.stock, 10);
  assert.equal(Object.hasOwn(migrated, "reservedStock"), false);
});

test("COD orders expire and release inventory after their confirmation window", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(orderInput(book));

  assert.ok(order.expiresAt > new Date());
  await Order.updateOne({ _id: order._id }, { $set: { expiresAt: new Date(0) } });
  assert.deepEqual(await orderService.expirePendingOrders(), [order.orderCode]);
  assert.equal((await Order.findById(order._id)).status, "CANCELLED");
  assert.equal((await Book.findById(book._id)).stock, 10);
});

test("legacy COD orders without expiresAt are still expired safely", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, { idempotencyKey: "legacy-cod-expiry-key" })
  );
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        expiresAt: null,
        placedAt: new Date(Date.now() - orderService.COD_PENDING_TTL_MS - 1),
      },
    }
  );

  assert.deepEqual(await orderService.expirePendingOrders(), [order.orderCode]);
  assert.equal((await Order.findById(order._id)).status, "CANCELLED");
  assert.equal((await Book.findById(book._id)).stock, 10);
});

test("COD requires a verified email and caps active pending orders", async () => {
  const book = await createBook({ stock: 100 });
  await User.updateOne({ _id: userId }, { $set: { emailVerifiedAt: null } });

  await assert.rejects(
    orderService.createOrder(
      orderInput(book, { idempotencyKey: "unverified-cod-key", items: [{ bookId: book.id, quantity: 1 }] })
    ),
    (error) =>
      error.code === "EMAIL_VERIFICATION_REQUIRED" && error.statusCode === 403
  );
  assert.equal((await Book.findById(book._id)).stock, 100);

  await User.updateOne({ _id: userId }, { $set: { emailVerifiedAt: new Date() } });
  for (let index = 0; index < orderService.MAX_PENDING_COD_PER_USER; index += 1) {
    await orderService.createOrder(
      orderInput(book, {
        idempotencyKey: `pending-cod-limit-${index}`,
        items: [{ bookId: book.id, quantity: 1 }],
      })
    );
  }

  await assert.rejects(
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "pending-cod-over-limit",
        items: [{ bookId: book.id, quantity: 1 }],
      })
    ),
    (error) => error.code === "PENDING_COD_LIMIT" && error.statusCode === 409
  );
  assert.equal(
    await Order.countDocuments({ user: userId }),
    orderService.MAX_PENDING_COD_PER_USER
  );
});

test("online orders cap active inventory reservations per user", async () => {
  const book = await createBook({ stock: 100 });
  for (
    let index = 0;
    index < orderService.MAX_PENDING_ONLINE_PER_USER;
    index += 1
  ) {
    await orderService.createOrder(
      orderInput(book, {
        idempotencyKey: `pending-online-limit-${index}`,
        paymentMethod: "VNPAY",
        items: [{ bookId: book.id, quantity: 1 }],
      })
    );
  }

  await assert.rejects(
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "pending-online-over-limit",
        paymentMethod: "MOMO",
        items: [{ bookId: book.id, quantity: 1 }],
      })
    ),
    (error) => error.code === "PENDING_ONLINE_LIMIT" && error.statusCode === 409
  );
  assert.equal(
    await Order.countDocuments({ user: userId }),
    orderService.MAX_PENDING_ONLINE_PER_USER
  );
  assert.equal(
    (await Book.findById(book._id)).stock,
    100 - orderService.MAX_PENDING_ONLINE_PER_USER
  );
});

test("concurrent COD reservations cannot cross the per-user pending cap", async () => {
  const book = await createBook({ stock: 100 });
  for (
    let index = 0;
    index < orderService.MAX_PENDING_COD_PER_USER - 1;
    index += 1
  ) {
    await orderService.createOrder(
      orderInput(book, {
        idempotencyKey: `concurrent-cod-existing-${index}`,
        items: [{ bookId: book.id, quantity: 1 }],
      })
    );
  }

  const attempts = await Promise.allSettled([
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "concurrent-cod-final-a",
        items: [{ bookId: book.id, quantity: 1 }],
      })
    ),
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "concurrent-cod-final-b",
        items: [{ bookId: book.id, quantity: 1 }],
      })
    ),
  ]);

  assert.equal(
    attempts.filter((attempt) => attempt.status === "fulfilled").length,
    1
  );
  assert.equal(
    attempts.filter(
      (attempt) =>
        attempt.status === "rejected" &&
        attempt.reason?.code === "PENDING_COD_LIMIT"
    ).length,
    1
  );
  assert.equal(
    await Order.countDocuments({ user: userId, status: "PENDING" }),
    orderService.MAX_PENDING_COD_PER_USER
  );
});

test("admin cancellation restores a pending COD reservation exactly once", async () => {
  const book = await createBook();
  const voucher = await createVoucher();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "admin-cancel-cod-key",
      voucherCode: voucher.code,
    })
  );
  const adminId = new mongoose.Types.ObjectId();

  const cancelled = await orderService.adminCancelOrder(
    order._id,
    adminId,
    "Rejected by store"
  );

  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.history.at(-1).by, `admin:${adminId}`);
  assert.equal((await Book.findById(book._id)).stock, 10);
  assert.equal((await Voucher.findById(voucher._id)).usedCount, 0);
  await assert.rejects(
    orderService.adminCancelOrder(order._id, adminId),
    /không thể huỷ|cannot cancel/i
  );
  assert.equal((await Book.findById(book._id)).stock, 10);
});

test("late online payment is refunded without restoring stock twice", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "late-online-payment-key",
      paymentMethod: "VNPAY",
    })
  );
  await Order.updateOne({ _id: order._id }, { $set: { expiresAt: new Date(0) } });

  assert.deepEqual(await orderService.expirePendingOrders(), [order.orderCode]);
  assert.equal((await Book.findById(book._id)).stock, 10);

  const originalRequestRefund = paymentGateway.requestRefund;
  paymentGateway.requestRefund = async ({ idempotencyKey }) => {
    const visibleOrder = await Order.findById(order._id).select(
      "+payment.refundIdempotencyKey"
    );
    assert.equal(visibleOrder.status, "REFUNDING");
    assert.equal(visibleOrder.payment.refundIdempotencyKey, idempotencyKey);
    return {
      ok: true,
      completed: true,
      refundTransactionId: "late-refund-transaction",
      rawPayload: { test: true },
    };
  };
  let late;
  try {
    late = await orderService.handlePaymentSuccess({
      orderCode: order.orderCode,
      method: "VNPAY",
      providerOrderId: order.payment.providerOrderId,
      transactionId: "captured-late-transaction",
      amount: order.totalAmount,
      rawPayload: { test: true },
    });
  } finally {
    paymentGateway.requestRefund = originalRequestRefund;
  }
  assert.equal(late.latePayment, true);
  assert.equal(late.order.status, "REFUNDED");

  const duplicate = await orderService.handlePaymentSuccess({
    orderCode: order.orderCode,
    method: "VNPAY",
    providerOrderId: order.payment.providerOrderId,
    transactionId: "captured-late-transaction",
    amount: order.totalAmount,
    rawPayload: { test: true },
  });
  assert.equal(duplicate.alreadyProcessed, true);

  await orderService.handleRefundSuccess({
    orderCode: order.orderCode,
    refundTransactionId: late.order.payment.refundTransactionId,
    rawPayload: { test: true },
  });
  assert.equal((await Order.findById(order._id)).status, "REFUNDED");
  assert.equal((await Book.findById(book._id)).stock, 10);
});

test("shipping fee is calculated from the server-side method", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "server-shipping-fee-key",
      shippingMethod: "express",
      shippingFee: 0,
    })
  );

  assert.equal(order.shippingMethod, "express");
  assert.equal(order.shippingFee, 25_000);
  assert.equal(order.totalAmount, 225_000);
});

test("invalid quantities and duplicate books are rejected before stock changes", async () => {
  const book = await createBook();

  await assert.rejects(
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "fractional-quantity-key",
        items: [{ bookId: book._id.toString(), quantity: 1.5 }],
      })
    ),
    (error) =>
      error.code === "ORDER_VALIDATION_ERROR" &&
      error.field === "items.0.quantity"
  );
  await assert.rejects(
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "duplicate-book-key",
        items: [
          { bookId: book._id.toString(), quantity: 1 },
          { bookId: book._id.toString(), quantity: 1 },
        ],
      })
    ),
    (error) => error.code === "ORDER_VALIDATION_ERROR"
  );

  assert.equal((await Book.findById(book._id)).stock, 10);
  assert.equal(await Order.countDocuments(), 0);
});

test("payment callback must match method, merchant reference and amount", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "callback-context-key",
      paymentMethod: "MOMO",
    })
  );

  await assert.rejects(
    orderService.handlePaymentSuccess({
      orderCode: order.orderCode,
      method: "MOMO",
      providerOrderId: order.payment.providerOrderId,
      transactionId: "123456",
      amount: order.totalAmount - 1,
      rawPayload: {},
    }),
    /amount does not match/
  );
  await assert.rejects(
    orderService.handlePaymentFailed({
      orderCode: order.orderCode,
      method: "MOMO",
      providerOrderId: "wrong-reference",
      amount: order.totalAmount,
      rawPayload: {},
    }),
    /reference does not match/
  );

  assert.equal((await Order.findById(order._id)).status, "PENDING");
  assert.equal((await Book.findById(book._id)).stock, 8);
});

test("a completed gateway refund restores paid-order inventory once", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "completed-refund-key",
      paymentMethod: "VNPAY",
    })
  );
  await orderService.handlePaymentSuccess({
    orderCode: order.orderCode,
    method: "VNPAY",
    providerOrderId: order.payment.providerOrderId,
    transactionId: "captured-refund-transaction",
    amount: order.totalAmount,
    rawPayload: {},
  });

  const refunded = await orderService.cancelOrder(order._id, userId, "test");
  assert.equal(refunded.status, "REFUNDED");
  assert.equal((await Book.findById(book._id)).stock, 10);

  await orderService.handleRefundSuccess({
    orderCode: order.orderCode,
    refundTransactionId: refunded.payment.refundTransactionId,
    rawPayload: {},
  });
  assert.equal((await Book.findById(book._id)).stock, 10);
});

test("failed refund calls remain durable and are retried from committed intent", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "durable-refund-intent-key",
      paymentMethod: "VNPAY",
    })
  );
  await orderService.handlePaymentSuccess({
    orderCode: order.orderCode,
    method: "VNPAY",
    providerOrderId: order.payment.providerOrderId,
    transactionId: "durable-refund-capture",
    amount: order.totalAmount,
    rawPayload: {},
  });

  const originalRequestRefund = paymentGateway.requestRefund;
  let gatewayCalls = 0;
  paymentGateway.requestRefund = async ({ idempotencyKey }) => {
    gatewayCalls += 1;
    const visibleOrder = await Order.findById(order._id).select(
      "+payment.refundIdempotencyKey"
    );
    assert.equal(visibleOrder.status, "REFUNDING");
    assert.equal(visibleOrder.payment.refundIdempotencyKey, idempotencyKey);
    if (gatewayCalls === 1) {
      return { ok: false, error: "temporary gateway outage" };
    }
    return {
      ok: true,
      completed: true,
      refundTransactionId: "durable-refund-result",
      rawPayload: { retried: true },
    };
  };

  try {
    const queued = await orderService.cancelOrder(order._id, userId, "test");
    assert.equal(queued.status, "REFUNDING");
    assert.equal(gatewayCalls, 1);
    assert.equal((await Book.findById(book._id)).stock, 8);

    await Order.updateOne(
      { _id: order._id },
      { $set: { "payment.refundNextRetryAt": new Date(0) } }
    );
    assert.equal(await orderService.reconcilePendingRefunds(), 1);
    assert.equal(gatewayCalls, 2);
    assert.equal((await Order.findById(order._id)).status, "REFUNDED");
    assert.equal((await Book.findById(book._id)).stock, 10);
  } finally {
    paymentGateway.requestRefund = originalRequestRefund;
  }
});

test("cart removes only purchased quantities at the correct payment milestone", async () => {
  const codBook = await createBook({ title: "COD cart book" });
  await Cart.create({
    user: userId,
    items: [{ book: codBook._id, quantity: 3 }],
  });
  await orderService.createOrder(
    orderInput(codBook, { idempotencyKey: "cod-cart-removal-key" })
  );
  assert.equal((await Cart.findOne({ user: userId })).items[0].quantity, 1);

  const onlineBook = await createBook({ title: "Online cart book" });
  await Cart.updateOne(
    { user: userId },
    { $set: { items: [{ book: onlineBook._id, quantity: 3 }] } }
  );
  const { order } = await orderService.createOrder(
    orderInput(onlineBook, {
      idempotencyKey: "online-cart-removal-key",
      paymentMethod: "VNPAY",
    })
  );
  assert.equal((await Cart.findOne({ user: userId })).items[0].quantity, 3);

  await orderService.handlePaymentSuccess({
    orderCode: order.orderCode,
    method: "VNPAY",
    providerOrderId: order.payment.providerOrderId,
    transactionId: "cart-payment-transaction",
    amount: order.totalAmount,
    rawPayload: {},
  });
  assert.equal((await Cart.findOne({ user: userId })).items[0].quantity, 1);
});

test("concurrent payment retries create at most one new gateway attempt", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "retry-payment-order-key",
      paymentMethod: "VNPAY",
    })
  );
  await Order.updateOne(
    { _id: order._id },
    { $set: { expiresAt: new Date(0) } }
  );

  const originalCreatePaymentUrl = paymentGateway.createPaymentUrl;
  let gatewayCalls = 0;
  paymentGateway.createPaymentUrl = async ({ transactionId }) => {
    gatewayCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      paymentUrl: `https://gateway.test/${transactionId}`,
      transactionId,
    };
  };
  try {
    const attempts = await Promise.allSettled([
      orderService.retryPayment({ orderId: order._id, userId }),
      orderService.retryPayment({ orderId: order._id, userId }),
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const created = fulfilled.filter((attempt) => !attempt.value.replayed);
    assert.equal(created.length, 1);
    assert.equal(gatewayCalls, 1);
    assert.ok(
      fulfilled.every(
        (attempt) => attempt.value.paymentUrl === created[0].value.paymentUrl
      )
    );

    const replay = await orderService.retryPayment({
      orderId: order._id,
      userId,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.paymentUrl, created[0].value.paymentUrl);
    assert.equal(gatewayCalls, 1);
  } finally {
    paymentGateway.createPaymentUrl = originalCreatePaymentUrl;
  }
});

test("payment retry history is bounded per order", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "bounded-payment-attempts-key",
      paymentMethod: "VNPAY",
    })
  );

  for (
    let index = 1;
    index < orderService.MAX_PAYMENT_ATTEMPTS_PER_ORDER;
    index += 1
  ) {
    await Order.updateOne(
      { _id: order._id },
      { $set: { expiresAt: new Date(0) } }
    );
    await orderService.retryPayment({ orderId: order._id, userId });
  }

  await Order.updateOne(
    { _id: order._id },
    { $set: { expiresAt: new Date(0) } }
  );
  await assert.rejects(
    orderService.retryPayment({ orderId: order._id, userId }),
    (error) => error.code === "PAYMENT_ATTEMPT_LIMIT" && error.statusCode === 409
  );
  const persisted = await Order.findById(order._id).select("+payment.attempts");
  assert.equal(
    persisted.payment.attempts.length,
    orderService.MAX_PAYMENT_ATTEMPTS_PER_ORDER
  );
  assert.equal((await Book.findById(book._id)).stock, 8);
});

test("failed gateway attempts enforce a retry cooldown", async () => {
  const book = await createBook();
  const originalCreatePaymentUrl = paymentGateway.createPaymentUrl;
  paymentGateway.createPaymentUrl = async () => {
    throw new Error("temporary gateway outage");
  };
  try {
    await assert.rejects(
      orderService.createOrder(
        orderInput(book, {
          idempotencyKey: "payment-retry-cooldown-key",
          paymentMethod: "MOMO",
        })
      ),
      /temporary gateway outage/
    );
  } finally {
    paymentGateway.createPaymentUrl = originalCreatePaymentUrl;
  }

  const order = await Order.findOne({ user: userId }).select(
    "+payment.attempts"
  );
  assert.equal(order.payment.attempts.at(-1).status, "FAILED");
  await assert.rejects(
    orderService.retryPayment({ orderId: order._id, userId }),
    (error) => error.code === "PAYMENT_RETRY_COOLDOWN" && error.statusCode === 429
  );
  assert.equal(order.payment.attempts.length, 1);
  assert.equal((await Book.findById(book._id)).stock, 8);
});

test("retry retains a legacy reference and accepts its delayed success callback", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "legacy-attempt-history-key",
      paymentMethod: "VNPAY",
    })
  );
  const originalReference = order.payment.providerOrderId;

  await Order.collection.updateOne(
    { _id: order._id },
    {
      $unset: { "payment.attempts": "" },
      $set: { expiresAt: new Date(0) },
    }
  );
  const retried = await orderService.retryPayment({
    orderId: order._id,
    userId,
  });
  const newReference = retried.order.payment.providerOrderId;
  assert.notEqual(newReference, originalReference);

  const afterRetry = await Order.findById(order._id).select(
    "+payment.attempts"
  );
  assert.deepEqual(
    afterRetry.payment.attempts.map((attempt) => attempt.providerOrderId),
    [originalReference, newReference]
  );

  const paid = await orderService.handlePaymentSuccess({
    orderCode: order.orderCode,
    method: "VNPAY",
    providerOrderId: originalReference,
    transactionId: "delayed-original-capture",
    amount: order.totalAmount,
    rawPayload: { delayed: true },
  });
  assert.equal(paid.order.status, "PAID");
  assert.equal(paid.order.payment.providerOrderId, originalReference);
  assert.equal(paid.order.payment.transactionId, "delayed-original-capture");

  const attempts = (
    await Order.findById(order._id).select("+payment.attempts")
  ).payment.attempts;
  assert.equal(
    attempts.find((attempt) => attempt.providerOrderId === originalReference)
      .status,
    "SUCCEEDED"
  );
  assert.equal(
    attempts.find((attempt) => attempt.providerOrderId === newReference).status,
    "PENDING"
  );
  assert.equal((await Book.findById(book._id)).stock, 8);
});

test("a second captured payment attempt is durably refunded without changing the paid order", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "duplicate-capture-refund-key",
      paymentMethod: "VNPAY",
    })
  );
  const olderReference = order.payment.providerOrderId;
  await Order.updateOne(
    { _id: order._id },
    { $set: { expiresAt: new Date(0) } }
  );
  const retried = await orderService.retryPayment({
    orderId: order._id,
    userId,
  });
  const winningReference = retried.order.payment.providerOrderId;

  await orderService.handlePaymentSuccess({
    orderCode: order.orderCode,
    method: "VNPAY",
    providerOrderId: winningReference,
    transactionId: "winning-capture",
    amount: order.totalAmount,
    rawPayload: {},
  });

  const originalRequestRefund = paymentGateway.requestRefund;
  let refundCalls = 0;
  paymentGateway.requestRefund = async (payload) => {
    refundCalls += 1;
    assert.equal(payload.providerOrderId, olderReference);
    assert.equal(payload.transactionId, "duplicate-capture");
    const committed = await Order.findById(order._id).select(
      "+payment.attempts"
    );
    assert.equal(committed.status, "PAID");
    assert.equal(
      committed.payment.attempts.find(
        (attempt) => attempt.providerOrderId === olderReference
      ).duplicateRefund.status,
      "PENDING"
    );
    if (refundCalls === 1) {
      throw new Error("temporary duplicate refund outage");
    }
    return {
      ok: true,
      completed: true,
      refundTransactionId: "duplicate-refund-transaction",
      rawPayload: { refunded: true },
    };
  };

  try {
    const duplicate = await orderService.handlePaymentSuccess({
      orderCode: order.orderCode,
      method: "VNPAY",
      providerOrderId: olderReference,
      transactionId: "duplicate-capture",
      amount: order.totalAmount,
      rawPayload: { delayed: true },
    });
    assert.equal(duplicate.duplicatePayment, true);
    assert.equal(duplicate.duplicateRefundCompleted, false);
    assert.equal(refundCalls, 1);

    const pendingRefund = await Order.findById(order._id).select(
      "+payment.attempts"
    );
    const pendingAttempt = pendingRefund.payment.attempts.find(
      (attempt) => attempt.providerOrderId === olderReference
    );
    assert.equal(pendingRefund.status, "PAID");
    assert.equal(pendingAttempt.duplicateRefund.status, "PENDING");
    assert.match(
      pendingAttempt.duplicateRefund.lastError,
      /temporary duplicate refund outage/
    );

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "payment.attempts.$[attempt].duplicateRefund.nextRetryAt": new Date(0),
        },
      },
      { arrayFilters: [{ "attempt.providerOrderId": olderReference }] }
    );
    assert.equal(await orderService.reconcilePendingRefunds(), 1);
    assert.equal(refundCalls, 2);

    const persisted = await Order.findById(order._id).select(
      "+payment.attempts"
    );
    const duplicateAttempt = persisted.payment.attempts.find(
      (attempt) => attempt.providerOrderId === olderReference
    );
    assert.equal(persisted.status, "PAID");
    assert.equal(persisted.payment.providerOrderId, winningReference);
    assert.equal(persisted.payment.transactionId, "winning-capture");
    assert.equal(duplicateAttempt.duplicateRefund.status, "REFUNDED");
    assert.equal(
      duplicateAttempt.duplicateRefund.refundTransactionId,
      "duplicate-refund-transaction"
    );
    assert.equal((await Book.findById(book._id)).stock, 8);
  } finally {
    paymentGateway.requestRefund = originalRequestRefund;
  }
});

test("a failed older attempt does not close the active payment attempt", async () => {
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "superseded-attempt-failure-key",
      paymentMethod: "MOMO",
    })
  );
  const olderReference = order.payment.providerOrderId;
  await Order.updateOne(
    { _id: order._id },
    { $set: { expiresAt: new Date(0) } }
  );
  const retried = await orderService.retryPayment({
    orderId: order._id,
    userId,
  });

  const unchanged = await orderService.handlePaymentFailed({
    orderCode: order.orderCode,
    method: "MOMO",
    providerOrderId: olderReference,
    amount: order.totalAmount,
    reason: "Older checkout expired",
    rawPayload: {},
  });
  assert.equal(unchanged.status, "PENDING");
  assert.equal(unchanged.payment.providerOrderId, retried.order.payment.providerOrderId);
  assert.equal((await Book.findById(book._id)).stock, 8);

  const attempts = (
    await Order.findById(order._id).select("+payment.attempts")
  ).payment.attempts;
  assert.equal(
    attempts.find((attempt) => attempt.providerOrderId === olderReference).status,
    "FAILED"
  );
  assert.equal(
    attempts.find(
      (attempt) =>
        attempt.providerOrderId === retried.order.payment.providerOrderId
    ).status,
    "PENDING"
  );
});

test("failed, cancelled and refunded orders release a voucher exactly once", async () => {
  const failedVoucher = await createVoucher();
  const failedBook = await createBook({ title: "Failed voucher book" });
  const { order: failedOrder } = await orderService.createOrder(
    orderInput(failedBook, {
      idempotencyKey: "failed-voucher-key",
      paymentMethod: "VNPAY",
      voucherCode: failedVoucher.code,
    })
  );
  assert.equal((await Voucher.findById(failedVoucher._id)).usedCount, 1);
  const failedContext = {
    orderCode: failedOrder.orderCode,
    method: "VNPAY",
    providerOrderId: failedOrder.payment.providerOrderId,
    amount: failedOrder.totalAmount,
    rawPayload: {},
  };
  await orderService.handlePaymentFailed(failedContext);
  await orderService.handlePaymentFailed(failedContext);
  assert.equal((await Voucher.findById(failedVoucher._id)).usedCount, 0);

  const cancelVoucher = await createVoucher();
  const cancelBook = await createBook({ title: "Cancel voucher book" });
  const { order: cancelOrder } = await orderService.createOrder(
    orderInput(cancelBook, {
      idempotencyKey: "cancel-voucher-key",
      voucherCode: cancelVoucher.code,
    })
  );
  await Promise.allSettled([
    orderService.cancelOrder(cancelOrder._id, userId),
    orderService.cancelOrder(cancelOrder._id, userId),
  ]);
  assert.equal((await Voucher.findById(cancelVoucher._id)).usedCount, 0);

  const refundVoucher = await createVoucher();
  const refundBook = await createBook({ title: "Refund voucher book" });
  const { order: refundOrder } = await orderService.createOrder(
    orderInput(refundBook, {
      idempotencyKey: "refund-voucher-key",
      paymentMethod: "VNPAY",
      voucherCode: refundVoucher.code,
    })
  );
  await orderService.handlePaymentSuccess({
    orderCode: refundOrder.orderCode,
    method: "VNPAY",
    providerOrderId: refundOrder.payment.providerOrderId,
    transactionId: "voucher-refund-transaction",
    amount: refundOrder.totalAmount,
    rawPayload: {},
  });
  await orderService.cancelOrder(refundOrder._id, userId);
  assert.equal((await Voucher.findById(refundVoucher._id)).usedCount, 0);
});

test("an order can apply one order voucher and one shipping voucher", async () => {
  const orderVoucher = await createVoucher({
    code: "DUALORDER",
    scope: "order",
    value: 10_000,
  });
  const shippingVoucher = await createVoucher({
    code: "DUALSHIP",
    scope: "shipping",
    value: 50_000,
  });
  const book = await createBook({ title: "Dual voucher book" });

  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "dual-voucher-key",
      orderVoucherCode: orderVoucher.code,
      shippingVoucherCode: shippingVoucher.code,
      authoritativeShipping: {
        method: "express",
        fee: 25_000,
        snapshot: { quoteId: "dual-voucher-shipping" },
      },
    })
  );

  assert.equal(order.voucher.code, orderVoucher.code);
  assert.equal(order.shippingVoucher.code, shippingVoucher.code);
  assert.equal(order.discountAmount, 35_000);
  assert.equal(order.shippingDiscountAmount, 25_000);
  assert.equal(order.totalAmount, order.subtotal - 10_000);
  assert.equal((await Voucher.findById(orderVoucher._id)).usedCount, 1);
  assert.equal((await Voucher.findById(shippingVoucher._id)).usedCount, 1);

  await orderService.cancelOrder(order._id, userId);
  assert.equal((await Voucher.findById(orderVoucher._id)).usedCount, 0);
  assert.equal((await Voucher.findById(shippingVoucher._id)).usedCount, 0);
});

test("voucher redemption ledger enforces the per-user limit concurrently", async () => {
  const voucher = await createVoucher({ usageLimit: 10, perUserLimit: 1 });
  const book = await createBook({ title: "Per-user voucher book", stock: 10 });
  const attempts = await Promise.allSettled([
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "per-user-voucher-a",
        voucherCode: voucher.code,
      })
    ),
    orderService.createOrder(
      orderInput(book, {
        idempotencyKey: "per-user-voucher-b",
        voucherCode: voucher.code,
      })
    ),
  ]);

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  let ledger = await VoucherRedemption.findOne({
    voucher: voucher._id,
    user: userId,
  });
  assert.equal(ledger.usageCount, 1);
  assert.equal((await Voucher.findById(voucher._id)).usedCount, 1);

  const successfulOrder = attempts.find(
    (result) => result.status === "fulfilled"
  ).value.order;
  await orderService.cancelOrder(successfulOrder._id, userId);
  ledger = await VoucherRedemption.findOne({ voucher: voucher._id, user: userId });
  assert.equal(ledger.usageCount, 0);

  const retry = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "per-user-voucher-after-release",
      voucherCode: voucher.code,
    })
  );
  assert.ok(retry.order);
  assert.equal(
    (await VoucherRedemption.findOne({ voucher: voucher._id, user: userId }))
      .usageCount,
    1
  );
});

test("voucher reconciliation migration is safe across app instances", async () => {
  const voucher = await createVoucher();
  const book = await createBook();
  const { order } = await orderService.createOrder(
    orderInput(book, {
      idempotencyKey: "legacy-voucher-release-key",
      paymentMethod: "VNPAY",
      voucherCode: voucher.code,
    })
  );
  await Order.collection.updateOne(
    { _id: order._id },
    {
      $set: { status: "FAILED", "payment.status": "FAILED" },
      $unset: { voucherReleasedAt: "" },
    }
  );

  await Promise.all([
    orderService.reconcileVoucherReleases(),
    orderService.reconcileVoucherReleases(),
  ]);

  assert.equal((await Voucher.findById(voucher._id)).usedCount, 0);
  const migrated = await Order.findById(order._id).select("+voucherReleasedAt");
  assert.ok(migrated.voucherReleasedAt);
});
