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
const Category = require("../src/models/Category");
const Promotion = require("../src/models/Promotion");
const User = require("../src/models/User");

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([
    User.syncIndexes(),
    Category.syncIndexes(),
    Book.syncIndexes(),
    Promotion.syncIndexes(),
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
});

async function adminAgent() {
  const agent = supertest.agent(app);
  const registered = await agent.post("/api/auth/register").send({
    name: "Admin",
    email: "admin@example.com",
    password: "secure-password",
  });
  await User.updateOne(
    { email: "admin@example.com" },
    { $set: { role: "admin" } }
  );
  return { agent, csrf: registered.body.data.csrfToken };
}

test("category references and category promotions stay consistent", async () => {
  const { agent, csrf } = await adminAgent();
  const categoryResponse = await agent
    .post("/api/categories")
    .set("x-csrf-token", csrf)
    .send({ name: "Literary Fiction", slug: "fiction" });
  assert.equal(categoryResponse.status, 201);
  const categoryId = categoryResponse.body.data.category._id;
  const categoriesBeforeRename = await agent.get("/api/categories");
  assert.equal(categoriesBeforeRename.status, 200);
  assert.equal(categoriesBeforeRename.body.data.categories[0].slug, "fiction");

  const missingRequiredFields = await agent
    .post("/api/books")
    .set("x-csrf-token", csrf)
    .send({
      title: "Incomplete Book",
      author: "Test Author",
      category: "fiction",
    });
  assert.equal(missingRequiredFields.status, 400);
  assert.equal(
    missingRequiredFields.body.code,
    "BOOK_REQUIRED_FIELDS_MISSING"
  );
  assert.match(missingRequiredFields.body.message, /giá bán/);
  assert.match(missingRequiredFields.body.message, /tồn kho/);
  assert.match(missingRequiredFields.body.message, /ảnh bìa/);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const uploaded = await agent
    .post("/api/admin/uploads/images")
    .set("x-csrf-token", csrf)
    .attach("image", png, { filename: "cover.png", contentType: "image/png" });
  assert.equal(uploaded.status, 201);

  const bookResponse = await agent
    .post("/api/books")
    .set("x-csrf-token", csrf)
    .send({
      title: "Test Book",
      author: "Test Author",
      price: 100_000,
      stock: 5,
      category: "fiction",
      imageUrl: uploaded.body.data.image.url,
    });
  assert.equal(bookResponse.status, 201);
  const bookId = bookResponse.body.data.book._id;

  const invalidNameTarget = await agent
    .post("/api/admin/promotions")
    .set("x-csrf-token", csrf)
    .send({
      name: "Wrong category key",
      type: "percent",
      value: 10,
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      scope: "category",
      category: "Literary Fiction",
      active: true,
    });
  assert.equal(invalidNameTarget.status, 400);

  const promotionResponse = await agent
    .post("/api/admin/promotions")
    .set("x-csrf-token", csrf)
    .send({
      name: "Fiction sale",
      type: "percent",
      value: 10,
      startDate: "2026-01-01",
      endDate: "2027-01-01",
      scope: "category",
      category: "fiction",
      active: true,
    });
  assert.equal(promotionResponse.status, 201);
  const promotionId = promotionResponse.body.data.promotion._id;

  const decorated = await Promotion.decorateBooks([
    await Book.findById(bookId),
  ]);
  assert.equal(decorated[0].price, 90_000);
  const blockedDelete = await agent
    .delete(`/api/categories/${categoryId}`)
    .set("x-csrf-token", csrf);
  assert.equal(blockedDelete.status, 409);
  assert.equal(blockedDelete.body.code, "CATEGORY_IN_USE");

  const renamed = await agent
    .put(`/api/categories/${categoryId}`)
    .set("x-csrf-token", csrf)
    .send({ name: "Novels", slug: "novels" });
  assert.equal(renamed.status, 200);
  const categoriesAfterRename = await agent.get("/api/categories");
  assert.equal(categoriesAfterRename.status, 200);
  assert.equal(categoriesAfterRename.body.data.categories[0].slug, "novels");
  assert.equal(categoriesAfterRename.body.data.categories[0].name, "Novels");
  assert.equal((await Book.findById(bookId)).category, "novels");
  assert.equal((await Promotion.findById(promotionId)).category, "novels");

  await Book.deleteOne({ _id: bookId });
  const promotionBlockedDelete = await agent
    .delete(`/api/categories/${categoryId}`)
    .set("x-csrf-token", csrf);
  assert.equal(promotionBlockedDelete.status, 409);
  assert.equal(promotionBlockedDelete.body.code, "CATEGORY_IN_USE");
  assert.equal(
    (
      await agent
        .delete(`/api/admin/promotions/${promotionId}`)
        .set("x-csrf-token", csrf)
    ).status,
    200
  );
  assert.equal(
    (
      await agent
        .delete(`/api/categories/${categoryId}`)
        .set("x-csrf-token", csrf)
    ).status,
    200
  );
});
