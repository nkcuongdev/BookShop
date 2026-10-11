process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

// Review round, section C: staff exits for orders the automatic flows leave
// stuck. Route level, on a replica set because the services use transactions.

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const AuditLog = require("../src/models/AuditLog");
const Order = require("../src/models/Order");
const OrderOutboxEvent = require("../src/models/OrderOutboxEvent");
const User = require("../src/models/User");

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Order.syncIndexes(), User.syncIndexes()]);
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
});

async function loginWithCsrf(user) {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(response.status, 200);
  return { agent, csrf: response.body.data.csrfToken };
}

function orderItems(count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    book: new mongoose.Types.ObjectId(),
    title: `Book ${index + 1}`,
    author: "Author",
    imageUrl: `https://images.example/${index + 1}.jpg`,
    price: 10_000,
    quantity: 1,
    subtotal: 10_000,
  }));
}

test("R-C1: support confirms a cancellation done outside the system, with a reason and an audit entry", async () => {
  const [customer, agentUser, warehouseUser] = await User.create([
    { name: "Parked Customer", email: "rc1-customer@example.com", password: "secure-password" },
    { name: "Support Agent", email: "rc1-support@example.com", password: "secure-password", role: "support" },
    { name: "Warehouse", email: "rc1-warehouse@example.com", password: "secure-password", role: "warehouse" },
  ]);
  const order = await Order.create({
    user: customer._id,
    items: orderItems(1),
    subtotal: 10_000,
    totalAmount: 10_000,
    status: Order.STATUS.CANCELLING,
    inventoryRestoredAt: new Date(),
    shippingAddress: { fullName: "Parked Customer", phone: "0900000000", address: "1 Test Street" },
    payment: { method: Order.PAYMENT_METHOD.COD, status: Order.PAYMENT_STATUS.UNPAID },
    shipment: {
      provider: "ghn",
      environment: "sandbox",
      providerOrderCode: "GHN-PARKED-1",
      providerStatus: "picking",
    },
  });
  await OrderOutboxEvent.create({
    type: OrderOutboxEvent.TYPE.SHIPMENT_CANCEL_REQUESTED,
    order: order._id,
    idempotencyKey: `shipment-cancel:${order._id}`,
    status: OrderOutboxEvent.STATUS.FAILED,
    attempts: 8,
    nextAttemptAt: null,
    payload: { previousStatus: Order.STATUS.PROCESSING, requestedBy: `user:${customer._id}`, reason: "Đổi ý" },
  });
  const url = `/api/admin/orders/${order._id}/cancellation/confirm-outside`;

  const warehouse = await loginWithCsrf(warehouseUser);
  const forbidden = await warehouse.agent.post(url).set("x-csrf-token", warehouse.csrf).send({ reason: "x" });
  assert.equal(forbidden.status, 403);

  const { agent, csrf } = await loginWithCsrf(agentUser);
  const missing = await agent.post(url).set("x-csrf-token", csrf).send({ reason: "  " });
  assert.equal(missing.status, 400, JSON.stringify(missing.body));
  assert.equal(missing.body.code, "REASON_REQUIRED");
  assert.equal((await Order.findById(order._id)).status, Order.STATUS.CANCELLING);

  const confirmed = await agent
    .post(url)
    .set("x-csrf-token", csrf)
    .send({ reason: "Đã huỷ trên trang quản lý GHN" });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  const stored = await Order.findById(order._id);
  assert.equal(stored.status, Order.STATUS.CANCELLED);
  assert.ok(stored.shipment.cancelledAt);
  const audit = await AuditLog.findOne({ targetId: order._id }).lean();
  assert.ok(audit, "an audit entry is recorded");
  assert.equal(String(audit.actor), String(agentUser._id));
  assert.match(audit.reason, /trang quản lý GHN/);
});
