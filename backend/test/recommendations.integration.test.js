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

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    AnalyticsEvent.syncIndexes(),
    Book.syncIndexes(),
    Order.syncIndexes(),
    User.syncIndexes(),
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

function book(overrides = {}) {
  return {
    title: "Recommendation Book",
    author: "Author",
    category: "fiction",
    tags: [],
    price: 100_000,
    stock: 10,
    status: "active",
    ...overrides,
  };
}

test("anonymous recommendations use product views and exclude the viewed book", async () => {
  const sessionId = "anonymous_session_123";
  const [viewed, related, unrelated] = await Book.create([
    book({ title: "Viewed Space Book", category: "science", tags: ["space"] }),
    book({ title: "Related Space Book", category: "science", tags: ["space"] }),
    book({ title: "Popular Cooking Book", category: "cooking", sold: 10_000 }),
  ]);
  await AnalyticsEvent.create({
    sessionId,
    type: "product_view",
    book: viewed._id,
  });

  const response = await supertest(app).get(
    `/api/books/recommendations?sessionId=${sessionId}&limit=3`
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal(response.body.data.personalized, true);
  assert.equal(response.body.data.basis.views, 1);
  assert.equal(response.body.data.books[0]._id, String(related._id));
  assert.equal(
    response.body.data.books.some((item) => item._id === String(viewed._id)),
    false
  );
  assert.equal(
    response.body.data.books.some((item) => item._id === String(unrelated._id)),
    true
  );
});

test("completed purchase history has more influence than a single view", async () => {
  const agent = supertest.agent(app);
  const registered = await agent.post("/api/auth/register").send({
    name: "Recommendation User",
    email: "recommendation@example.com",
    password: "secure-password",
  });
  assert.equal(registered.status, 201);

  const [purchased, purchaseMatch, viewed, viewMatch] = await Book.create([
    book({ title: "Purchased History", author: "Historian", category: "history" }),
    book({ title: "More History", author: "Historian", category: "history" }),
    book({ title: "Viewed Romance", author: "Romance Writer", category: "romance" }),
    book({ title: "More Romance", author: "Romance Writer", category: "romance" }),
  ]);
  await Order.create({
    user: registered.body.data.user.id,
    items: [
      {
        book: purchased._id,
        title: purchased.title,
        author: purchased.author,
        category: purchased.category,
        price: purchased.price,
        quantity: 1,
        subtotal: purchased.price,
      },
    ],
    subtotal: purchased.price,
    totalAmount: purchased.price,
    shippingAddress: {
      fullName: "Recommendation User",
      phone: "0900000000",
      address: "1 Test Street",
    },
    status: Order.STATUS.DELIVERED,
    payment: {
      method: Order.PAYMENT_METHOD.COD,
      status: Order.PAYMENT_STATUS.PAID,
    },
    deliveredAt: new Date(),
  });
  const sessionId = "signed_in_session_123";
  await AnalyticsEvent.create({
    sessionId,
    type: "product_view",
    book: viewed._id,
  });

  const response = await agent.get(
    `/api/books/recommendations?sessionId=${sessionId}&limit=4`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.personalized, true);
  assert.equal(response.body.data.basis.purchases, 1);
  assert.equal(response.body.data.basis.views, 1);
  assert.equal(response.body.data.books[0]._id, String(purchaseMatch._id));
  assert.equal(
    response.body.data.books.findIndex((item) => item._id === String(purchaseMatch._id)) <
      response.body.data.books.findIndex((item) => item._id === String(viewMatch._id)),
    true
  );
});

test("visitors without history receive a non-personalized popular fallback", async () => {
  await Book.create([
    book({ title: "Less Popular", sold: 5 }),
    book({ title: "Most Popular", sold: 50 }),
  ]);

  const response = await supertest(app).get(
    "/api/books/recommendations?sessionId=fallback_session_123&limit=2"
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.personalized, false);
  assert.equal(response.body.data.books[0].title, "Most Popular");
});
