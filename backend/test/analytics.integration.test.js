process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const AnalyticsEvent = require("../src/models/AnalyticsEvent");
const Book = require("../src/models/Book");
const Order = require("../src/models/Order");
const User = require("../src/models/User");
const { getZonedDateWindow } = require("../src/services/analyticsService");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
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

async function adminAgent() {
  const agent = supertest.agent(app);
  const registered = await agent.post("/api/auth/register").send({
    name: "Analytics Admin",
    email: "analytics-admin@example.com",
    password: "secure-password",
  });
  const admin = await User.findOneAndUpdate(
    { email: "analytics-admin@example.com" },
    { $set: { role: "admin" } },
    { returnDocument: "after" }
  );
  return { agent, csrf: registered.body.data.csrfToken, admin };
}

function paidOrder(userId, bookId, category) {
  return Order.create({
    user: userId,
    items: [
      {
        book: bookId,
        title: "Snapshot Book",
        author: "Author",
        category,
        price: 100000,
        quantity: 2,
        subtotal: 200000,
      },
    ],
    subtotal: 200000,
    totalAmount: 200000,
    status: "PAID",
    shippingAddress: {
      fullName: "Buyer",
      phone: "0900000000",
      address: "HCMC",
    },
    payment: { method: "VNPAY", status: "PAID" },
    paidAt: new Date(),
  });
}

test("funnel counts distinct authenticated users or anonymous sessions", async () => {
  const { agent, admin } = await adminAgent();
  const now = new Date();
  await AnalyticsEvent.insertMany([
    { type: "product_view", sessionId: "session-a", createdAt: now },
    { type: "product_view", sessionId: "session-a", createdAt: now },
    { type: "add_to_cart", sessionId: "session-a", createdAt: now },
    { type: "add_to_cart", sessionId: "session-a", createdAt: now },
    { type: "product_view", sessionId: "session-b", createdAt: now },
    { type: "product_view", sessionId: "one-device", user: admin._id, createdAt: now },
    { type: "product_view", sessionId: "other-device", user: admin._id, createdAt: now },
    { type: "order_created", sessionId: "other-device", user: admin._id, createdAt: now },
  ]);

  const response = await agent.get("/api/admin/analytics/funnel?days=30");
  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.data.stages.map(({ value }) => value),
    [3, 1, 0, 1, 0]
  );
});

test("category revenue uses the immutable order snapshot after a book is recategorized", async () => {
  const { agent, admin } = await adminAgent();
  const book = await Book.create({
    title: "Snapshot Book",
    author: "Author",
    price: 100000,
    category: "literature",
  });
  await paidOrder(admin._id, book._id, "literature");
  await Book.updateOne({ _id: book._id }, { $set: { category: "technology" } });

  const response = await agent.get("/api/admin/analytics/category-share");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.share, [{ name: "literature", value: 100 }]);
});

test("legacy orders receive a one-time category snapshot migration", async () => {
  const { admin } = await adminAgent();
  const book = await Book.create({
    title: "Legacy Book",
    author: "Author",
    price: 50000,
    category: "legacy-category",
  });
  const orderId = new mongoose.Types.ObjectId();
  await Order.collection.insertOne({
    _id: orderId,
    orderCode: "OD-LEGACY-CATEGORY",
    user: admin._id,
    items: [
      {
        book: book._id,
        title: book.title,
        author: book.author,
        price: 50000,
        quantity: 1,
        subtotal: 50000,
      },
    ],
    subtotal: 50000,
    totalAmount: 50000,
    shippingAddress: { fullName: "Buyer", phone: "0900000000", address: "HCMC" },
    payment: { method: "COD", status: "UNPAID", attempts: [] },
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await Order.migrateItemCategorySnapshots();
  assert.equal((await Order.findById(orderId)).items[0].category, "legacy-category");
});

test("Vietnam analytics date windows are independent from the server timezone", () => {
  const window = getZonedDateWindow(
    2,
    new Date("2026-07-26T02:00:00.000Z"),
    "Asia/Ho_Chi_Minh"
  );
  assert.equal(window.start.toISOString(), "2026-07-24T17:00:00.000Z");
  assert.equal(window.endExclusive.toISOString(), "2026-07-26T17:00:00.000Z");
  assert.deepEqual(
    window.calendarDays.map((day) => day.key),
    ["2026-07-25", "2026-07-26"]
  );
});
