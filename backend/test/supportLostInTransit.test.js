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
const Order = require("../src/models/Order");
const SupportTicket = require("../src/models/SupportTicket");
const User = require("../src/models/User");
const paymentGateway = require("../src/services/paymentGateway");
const orderService = require("../src/services/orderService");
const shippingService = require("../src/services/shippingService");
const supportResolutionService = require("../src/services/supportResolutionService");

let mongo;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), Book.syncIndexes(), Order.syncIndexes()]);
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
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { agent, csrf: response.body.data.csrfToken };
}

let seq = 0;
function makeUser(role = "user") {
  seq += 1;
  return User.create({
    name: role === "admin" ? `Agent ${seq}` : `Customer ${seq}`,
    email: `lost-${role}-${seq}@example.com`,
    password: "secure-password",
    role,
  });
}

/** An order that has been handed to the carrier and paid online. */
async function shippedOrder(user, { method = "VNPAY", paymentStatus = "PAID" } = {}) {
  const book = await Book.create({
    title: "In Transit Book",
    author: "A",
    price: 200000,
    category: "technology",
    stock: 10,
    status: "active",
  });
  const order = await Order.create({
    user: user._id,
    items: [
      {
        book: book._id,
        title: book.title,
        category: "technology",
        price: 200000,
        quantity: 1,
        subtotal: 200000,
      },
    ],
    subtotal: 200000,
    totalAmount: 200000,
    status: Order.STATUS.SHIPPED,
    shippedAt: new Date(),
    placedAt: new Date(),
    payment: {
      method,
      status: paymentStatus,
      transactionId: "tx-lost-1",
      providerOrderId: "provider-lost-1",
      paidAt: new Date(),
    },
    shippingAddress: { fullName: user.name, phone: "0900000000", address: "1 Test Street" },
  });
  return { order, book };
}

async function ticketFor(customer, order, category = "NOT_RECEIVED") {
  const session = await sessionFor(customer);
  const created = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category,
      description: "Đơn đã gửi 20 ngày nhưng vẫn chưa tới, tra cứu không thấy cập nhật.",
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { session, ticketId: created.body.data.ticket._id };
}

test("a full lost-parcel refund closes the order without restoring lost stock", async (t) => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await shippedOrder(customer);
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  const refundCalls = [];
  t.mock.method(paymentGateway, "requestRefund", async (payload) => {
    refundCalls.push(payload);
    // `completed` is what marks the money as actually settled; `ok` alone only
    // means the gateway accepted the instruction.
    return { ok: true, completed: true, refundTransactionId: "refund-lost-1" };
  });

  const resolved = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_REFUND",
      note: "Đơn vị vận chuyển xác nhận thất lạc",
      items: [{ bookId: String(order.items[0].book), quantity: 1 }],
    });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));

  const ticket = resolved.body.data.ticket;
  assert.equal(ticket.resolution.type, "LOST_IN_TRANSIT_REFUND");
  assert.equal(ticket.resolution.status, "REFUND_COMPLETED");
  assert.equal(ticket.resolution.amount, 200000);
  assert.equal(ticket.status, "RESOLVED");

  assert.equal(refundCalls.length, 1);
  assert.equal(refundCalls[0].amount, 200000);
  assert.match(
    refundCalls[0].idempotencyKey,
    new RegExp(`^support-refund:${ticketId}:[0-9a-f-]+$`)
  );

  const storedOrder = await Order.findById(order._id)
    .select("+supportCompensation.reservedRefundAmount +inventoryRestoredAt")
    .lean();
  assert.equal(
    storedOrder.status,
    Order.STATUS.REFUNDED,
    "a full lost-parcel refund closes the order lifecycle"
  );
  assert.equal(
    storedOrder.inventoryRestoredAt,
    null,
    "settling money must not record lost goods as returned to inventory"
  );
  assert.equal(storedOrder.supportCompensation.refundedAmount, 200000);
  assert.equal(
    storedOrder.supportCompensation.reservedRefundAmount,
    0,
    "the reservation is settled, not left dangling"
  );

  // The ticket can now be closed, since the resolution reached a terminal state.
  const closed = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "CLOSED" });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
});

test("a pending support refund closes the order without creating virtual stock", async (t) => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await shippedOrder(customer);
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  // VNPay answers ok without a terminal transaction status while it settles.
  // The money has not reached the customer, so nothing may be reported as done.
  t.mock.method(paymentGateway, "requestRefund", async () => ({
    ok: true,
    completed: false,
    refundTransactionId: "refund-pending-1",
  }));

  const resolved = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_REFUND",
      note: "Đơn vị vận chuyển xác nhận thất lạc",
      items: [{ bookId: String(order.items[0].book), quantity: 1 }],
    });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));

  const ticket = resolved.body.data.ticket;
  assert.equal(ticket.resolution.status, "REFUND_PROCESSING");
  assert.notEqual(ticket.status, "RESOLVED", "an unsettled refund cannot resolve the ticket");

  const storedOrder = await Order.findById(order._id)
    .select("+supportCompensation.reservedRefundAmount")
    .lean();
  // Not yet refunded, but the headroom stays held so a second refund cannot be
  // approved against the same money while this one is in flight.
  assert.equal(storedOrder.supportCompensation.refundedAmount, 0);
  assert.equal(storedOrder.supportCompensation.reservedRefundAmount, 200000);

  await assert.rejects(
    orderService.handleRefundSuccess({
      orderCode: order.orderCode,
      refundTransactionId: "refund-pending-1",
      rawPayload: { status: "success" },
    }),
    /does not match the order/,
    "a support refund id must never settle the order-level refund workflow"
  );

  const pendingTicket = await SupportTicket.findById(ticketId);
  await assert.rejects(
    supportResolutionService.settleProcessingRefund(
      pendingTicket,
      "refund-for-a-different-business"
    ),
    (error) => error.code === "REFUND_REFERENCE_MISMATCH"
  );
  assert.equal(
    await supportResolutionService.settleProcessingRefund(
      pendingTicket,
      "refund-pending-1"
    ),
    true
  );
  const settledOrder = await Order.findById(order._id)
    .select("+supportCompensation.reservedRefundAmount +inventoryRestoredAt")
    .lean();
  assert.equal(settledOrder.status, Order.STATUS.REFUNDED);
  assert.equal(settledOrder.inventoryRestoredAt, null);
  assert.equal(settledOrder.supportCompensation.refundedAmount, 200000);
  assert.equal(settledOrder.supportCompensation.reservedRefundAmount, 0);
});

test("a lost COD parcel waits for the agent to record the transfer", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await shippedOrder(customer, { method: "COD", paymentStatus: "PAID" });
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  const resolved = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_REFUND",
      note: "Thất lạc",
      items: [{ bookId: String(order.items[0].book), quantity: 1 }],
    });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.data.ticket.resolution.status, "REFUND_MANUAL_REQUIRED");

  const recorded = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/refund`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ transactionId: "bank-transfer-991" });
  assert.equal(recorded.status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.data.ticket.resolution.status, "REFUND_COMPLETED");
  assert.equal(recorded.body.data.ticket.resolution.refund.transactionId, "bank-transfer-991");

  const storedOrder = await Order.findById(order._id)
    .select("+supportCompensation.reservedRefundAmount")
    .lean();
  assert.equal(storedOrder.supportCompensation.refundedAmount, 200000);
  assert.equal(storedOrder.supportCompensation.reservedRefundAmount, 0);
});

test("a lost parcel can instead be reshipped, holding stock and completing the order", async (t) => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await shippedOrder(customer);
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  const created = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_RESHIP",
      note: "Giao lại cho khách",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.data.ticket.resolution.status, "PREPARING");
  assert.equal(
    (await Book.findById(book._id).lean()).stock,
    9,
    "stock is held as soon as the replacement is created"
  );

  t.mock.method(shippingService, "createSupportShipment", async () => ({
    provider: "ghn",
    environment: "sandbox",
    carrier: "GHN Express",
    clientOrderCode: "support-lost-1",
    trackingNumber: "GHN-LOST-1",
    providerStatus: "ready_to_pick",
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  }));

  const shipped = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "SHIPPED", provider: "ghn" });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.body));
  assert.equal(shipped.body.data.ticket.resolution.shipment.trackingNumber, "GHN-LOST-1");

  const delivered = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "DELIVERED" });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  assert.equal(delivered.body.data.ticket.resolution.status, "DELIVERED");
  assert.equal(delivered.body.data.ticket.status, "RESOLVED");

  const storedOrder = await Order.findById(order._id).lean();
  assert.equal(
    storedOrder.status,
    Order.STATUS.DELIVERED,
    "a successful replacement fulfils the original order instead of leaving it SHIPPED"
  );
});

test("an unpaid lost COD parcel is reshipped with the full outstanding COD", async (t) => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await shippedOrder(customer, {
    method: "COD",
    paymentStatus: "UNPAID",
  });
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  const created = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_RESHIP",
      note: "Giao lại và thu COD",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.data.ticket.resolution.shipment.codAmount, 200000);

  t.mock.method(shippingService, "createSupportShipment", async () => ({
    provider: "ghn",
    environment: "sandbox",
    carrier: "GHN Express",
    clientOrderCode: "support-cod-1",
    trackingNumber: "GHN-COD-1",
    providerStatus: "ready_to_pick",
    codAmount: 200000,
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  }));

  const shipped = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "SHIPPED", provider: "ghn" });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.body));
  assert.equal(shipped.body.data.ticket.resolution.shipment.codAmount, 200000);

  const delivered = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "DELIVERED" });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  const storedOrder = await Order.findById(order._id).lean();
  assert.equal(storedOrder.status, Order.STATUS.DELIVERED);
  assert.equal(storedOrder.payment.status, Order.PAYMENT_STATUS.PAID);
});

test("an unpaid lost COD parcel cannot be marked delivered from a free reship", async (t) => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await shippedOrder(customer, {
    method: "COD",
    paymentStatus: "UNPAID",
  });
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_RESHIP",
      note: "Giao lại",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });

  t.mock.method(shippingService, "createSupportShipment", async () => ({
    provider: "ghn",
    environment: "sandbox",
    carrier: "GHN Express",
    clientOrderCode: "support-free-cod-1",
    trackingNumber: "GHN-FREE-COD-1",
    providerStatus: "ready_to_pick",
    codAmount: 0,
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  }));

  await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "SHIPPED", provider: "ghn" });
  const delivered = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "DELIVERED" });
  assert.equal(delivered.status, 409, JSON.stringify(delivered.body));
  assert.equal(delivered.body.code, "RESHIP_COD_NOT_COLLECTED");

  const storedOrder = await Order.findById(order._id).lean();
  assert.equal(storedOrder.status, Order.STATUS.SHIPPED);
  assert.equal(storedOrder.payment.status, Order.PAYMENT_STATUS.UNPAID);
});

test("cancelling a lost-parcel replacement returns the held stock", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await shippedOrder(customer);
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_RESHIP",
      note: "Giao lại",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal((await Book.findById(book._id).lean()).stock, 9);

  const cancelled = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "CANCELLED", note: "Khách đổi ý, muốn hoàn tiền" });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal((await Book.findById(book._id).lean()).stock, 10, "stock is returned");
});

test("lost-in-transit actions are rejected for orders that are not in transit", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await shippedOrder(customer);
  await Order.updateOne({ _id: order._id }, { $set: { status: Order.STATUS.DELIVERED } });
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  const response = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_REFUND",
      note: "Thất lạc",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, "ORDER_NOT_IN_TRANSIT");
});

test("an unpaid in-transit order is steered away from a refund", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await shippedOrder(customer, {
    method: "COD",
    paymentStatus: "UNPAID",
  });
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  const response = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_REFUND",
      note: "Thất lạc",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, "ORDER_NOT_PAID");
});

test("a lost parcel cannot be both refunded and reshipped", async (t) => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await shippedOrder(customer);
  const { ticketId } = await ticketFor(customer, order);
  const adminSession = await sessionFor(admin);

  t.mock.method(paymentGateway, "requestRefund", async () => ({
    ok: true,
    refundTransactionId: "refund-dup-1",
  }));

  const first = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_REFUND",
      note: "Thất lạc",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(first.status, 200, JSON.stringify(first.body));

  const second = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "LOST_IN_TRANSIT_RESHIP",
      note: "Giao lại nữa",
      items: [{ bookId: String(book._id), quantity: 1 }],
    });
  // The same line item is already committed to the in-flight refund, so a
  // second compensation is rejected before it can reserve more stock/money.
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "RESOLUTION_EXISTS");

  // A ticket that still has a live resolution is refused on that basis too.
  const otherCustomerTicket = await SupportTicket.findOne({ _id: ticketId }).lean();
  assert.equal(otherCustomerTicket.resolution.type, "LOST_IN_TRANSIT_REFUND");
});
