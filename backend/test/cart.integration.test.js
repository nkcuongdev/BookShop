process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Book = require("../src/models/Book");
const Cart = require("../src/models/Cart");
const User = require("../src/models/User");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), Book.syncIndexes(), Cart.syncIndexes()]);
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

async function sessionAgent() {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/register").send({
    name: "Cart User",
    email: "cart@example.com",
    password: "secure-password",
  });
  return { agent, csrf: response.body.data.csrfToken };
}

test("cart validates mutations and returns stock-normalized authoritative state", async () => {
  const { agent, csrf } = await sessionAgent();
  const book = await Book.create({
    title: "Cart Book",
    author: "Author",
    price: 100_000,
    stock: 3,
    category: "fiction",
  });

  const invalidQuantity = await agent
    .post("/api/cart/items")
    .set("x-csrf-token", csrf)
    .send({ bookId: book._id, quantity: 1.5 });
  assert.equal(invalidQuantity.status, 400);

  const checkoutIncompatibleQuantity = await agent
    .post("/api/cart/items")
    .set("x-csrf-token", csrf)
    .send({ bookId: book._id, quantity: 100 });
  assert.equal(checkoutIncompatibleQuantity.status, 400);

  const added = await agent
    .post("/api/cart/items")
    .set("x-csrf-token", csrf)
    .send({ bookId: book._id, quantity: 99 });
  assert.equal(added.status, 200);
  assert.equal(added.body.data.cart.items[0].quantity, 3);

  const invalidMerge = await agent
    .post("/api/cart/merge")
    .set("x-csrf-token", csrf)
    .send({ items: [{ bookId: { $ne: null }, quantity: 1 }] });
  assert.equal(invalidMerge.status, 400);
  assert.equal((await Cart.findOne()).items[0].quantity, 3);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const merged = await agent
      .post("/api/cart/merge")
      .set("x-csrf-token", csrf)
      .send({ items: [{ bookId: book._id, quantity: 3 }] });
    assert.equal(merged.status, 200);
  }
  assert.equal((await Cart.findOne()).items[0].quantity, 3);
});

test("concurrent initial reads create only one cart per user", async () => {
  const { agent } = await sessionAgent();
  const responses = await Promise.all([
    agent.get("/api/cart"),
    agent.get("/api/cart"),
    agent.get("/api/cart"),
  ]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(await Cart.countDocuments(), 1);
});

test("concurrent cart mutations retry instead of overwriting each other", async () => {
  const { agent, csrf } = await sessionAgent();
  const book = await Book.create({
    title: "Concurrent Cart Book",
    author: "Author",
    price: 100_000,
    stock: 20,
    category: "fiction",
  });

  const responses = await Promise.all([
    agent
      .post("/api/cart/items")
      .set("x-csrf-token", csrf)
      .send({ bookId: book._id, quantity: 1 }),
    agent
      .post("/api/cart/items")
      .set("x-csrf-token", csrf)
      .send({ bookId: book._id, quantity: 1 }),
  ]);

  assert.ok(responses.every((response) => response.status === 200));
  const stored = await Cart.findOne();
  assert.equal(stored.items.length, 1);
  assert.equal(stored.items[0].quantity, 2);
});

test("unavailable books stay visible until the customer removes them", async () => {
  const { agent, csrf } = await sessionAgent();
  const book = await Book.create({
    title: "Unavailable Cart Book",
    author: "Author",
    price: 100_000,
    stock: 5,
    category: "fiction",
  });

  const added = await agent
    .post("/api/cart/items")
    .set("x-csrf-token", csrf)
    .send({ bookId: book._id, quantity: 2 });
  assert.equal(added.status, 200);

  await Book.updateOne({ _id: book._id }, { $set: { status: "inactive" } });
  const normalized = await agent.get("/api/cart");
  assert.equal(normalized.status, 200);
  assert.equal(normalized.body.data.cart.items.length, 1);
  assert.equal(normalized.body.data.cart.items[0].available, false);
  assert.equal(normalized.body.data.cart.items[0].unavailableReason, "inactive");
  assert.deepEqual(normalized.body.data.cart.unavailableItems, [
    { bookId: String(book._id), reason: "inactive" },
  ]);
  assert.equal((await Cart.findOne()).items.length, 1);

  await Book.updateOne({ _id: book._id }, { $set: { status: "active" } });
  const restoredBook = await agent.get("/api/cart");
  assert.equal(restoredBook.body.data.cart.items.length, 1);
  assert.equal(restoredBook.body.data.cart.items[0].available, true);
});
