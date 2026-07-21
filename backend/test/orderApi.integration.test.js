process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Order = require("../src/models/Order");
const User = require("../src/models/User");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), Order.syncIndexes()]);
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

async function loginAs(user) {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(response.status, 200);
  return agent;
}

async function loginWithCsrf(user) {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(response.status, 200);
  return { agent, csrf: response.body.data.csrfToken };
}

function orderItems(count = 6) {
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

test("order creation rejects a missing authoritative shipping option", async () => {
  const customer = await User.create({
    name: "Shipping Customer",
    email: "shipping-required@example.com",
    password: "secure-password",
  });
  const { agent, csrf } = await loginWithCsrf(customer);

  const response = await agent
    .post("/api/orders")
    .set("x-csrf-token", csrf)
    .send({
      items: [
        {
          bookId: new mongoose.Types.ObjectId().toString(),
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: "Shipping Customer",
        phone: "0900000000",
        address: "1 Test Street",
      },
      paymentMethod: "COD",
      shippingMethod: "standard",
      shippingFee: 0,
    });

  assert.equal(response.status, 422);
  assert.equal(response.body.code, "SHIPPING_OPTION_REQUIRED");
  assert.equal(await Order.countDocuments(), 0);
});

test("GHN webhook uses a fixed URL and rejects an unverifiable payload", async () => {
  const legacyResponse = await supertest(app)
    .post("/api/shipping/webhooks/ghn/leaked-secret")
    .send({});
  assert.equal(legacyResponse.status, 404);

  const response = await supertest(app)
    .post("/api/shipping/webhooks/ghn")
    .send({ Status: "delivered" });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "INVALID_GHN_WEBHOOK");
});

test("customer order DTOs hide gateway audit data and bound list payloads", async () => {
  const [customer, admin] = await User.create([
    {
      name: "Customer",
      email: "customer-orders@example.com",
      password: "secure-password",
    },
    {
      name: "Admin",
      email: "admin-orders@example.com",
      password: "secure-password",
      role: "admin",
    },
  ]);
  const items = orderItems();
  const order = await Order.create({
    user: customer._id,
    items,
    subtotal: 60_000,
    totalAmount: 60_000,
    shippingAddress: {
      fullName: "Customer",
      phone: "0900000000",
      address: "1 Test Street",
    },
    status: Order.STATUS.PAID,
    payment: {
      method: Order.PAYMENT_METHOD.VNPAY,
      status: Order.PAYMENT_STATUS.PAID,
      transactionId: "public-transaction",
      providerOrderId: "private-provider-reference",
      rawPayload: { signature: "private-payment-signature" },
      refundRawPayload: { signature: "private-refund-signature" },
      attempts: [
        {
          providerOrderId: "private-attempt-reference",
          method: Order.PAYMENT_METHOD.VNPAY,
          amount: 60_000,
          status: Order.PAYMENT_ATTEMPT_STATUS.SUCCEEDED,
          rawPayload: { signature: "private-attempt-signature" },
        },
      ],
    },
    history: [{ from: "PENDING", to: "PAID", by: "gateway" }],
  });

  const customerAgent = await loginAs(customer);
  const listResponse = await customerAgent.get("/api/orders");
  assert.equal(listResponse.status, 200);
  const summary = listResponse.body.data.orders[0];
  assert.equal(summary.itemCount, items.length);
  assert.equal(summary.itemsPreview.length, 4);
  assert.equal(summary.items, undefined);
  assert.equal(summary.payment, undefined);
  assert.equal(summary.history, undefined);
  assert.doesNotMatch(JSON.stringify(summary), /private-/);

  const detailResponse = await customerAgent.get(`/api/orders/${order._id}`);
  assert.equal(detailResponse.status, 200);
  const detail = detailResponse.body.data.order;
  assert.equal(detail.payment.transactionId, "public-transaction");
  assert.equal(detail.payment.providerOrderId, undefined);
  assert.equal(detail.payment.rawPayload, undefined);
  assert.equal(detail.payment.attempts, undefined);
  assert.doesNotMatch(JSON.stringify(detail), /private-/);

  const adminAgent = await loginAs(admin);
  const auditResponse = await adminAgent.get(
    `/api/admin/orders/${order._id}/payment-audit`
  );
  assert.equal(auditResponse.status, 200, JSON.stringify(auditResponse.body));
  const auditJson = JSON.stringify(auditResponse.body.data.paymentAudit);
  assert.match(auditJson, /private-payment-signature/);
  assert.match(auditJson, /private-attempt-signature/);
});
