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
const StockLedger = require("../src/models/StockLedger");
const Supplier = require("../src/models/Supplier");
const User = require("../src/models/User");

// The admin book form now carries the warehouse settings (reorder thresholds
// and a default supplier) but must never carry `stock` on an update — that is
// owned by the inventory ledger. These tests pin both halves of that contract.

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([
    Book.syncIndexes(),
    Category.syncIndexes(),
    StockLedger.syncIndexes(),
    Supplier.syncIndexes(),
    User.syncIndexes(),
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
  await Category.create({ name: "Fiction", slug: "fiction" });
});

async function adminAgent() {
  const agent = supertest.agent(app);
  const credentials = {
    name: "Admin",
    email: "admin-book-inventory@example.com",
    password: "secure-password",
  };
  let authenticated = await agent.post("/api/auth/register").send(credentials);
  if (authenticated.status === 429) {
    await User.create({ ...credentials, role: "admin" });
    authenticated = await agent.post("/api/auth/login").send({
      email: credentials.email,
      password: credentials.password,
    });
  }
  await User.updateOne({ email: credentials.email }, { $set: { role: "admin" } });
  return { agent, csrf: authenticated.body.data.csrfToken };
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

/**
 * Book covers have to come from the managed image store, so a create through
 * the API needs a real upload first.
 */
async function uploadCover(agent, csrf) {
  const uploaded = await agent
    .post("/api/admin/uploads/images")
    .set("x-csrf-token", csrf)
    .attach("image", PNG, { filename: "cover.png", contentType: "image/png" });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  return uploaded.body.data.image.url;
}

function bookPayload(imageUrl, overrides = {}) {
  return {
    title: "Warehouse Settings Book",
    author: "Author",
    price: 120_000,
    stock: 12,
    category: "fiction",
    imageUrl,
    ...overrides,
  };
}

/** Create a book through the API and return its id. */
async function createBookViaApi(agent, csrf, overrides = {}) {
  const imageUrl = await uploadCover(agent, csrf);
  const created = await agent
    .post("/api/books")
    .set("x-csrf-token", csrf)
    .send(bookPayload(imageUrl, overrides));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data.book._id;
}

test("creating a book stores its reorder settings and seeds the ledger", async () => {
  const { agent, csrf } = await adminAgent();
  const supplier = await Supplier.create({ code: "NXBTRE", name: "NXB Tre" });

  const bookId = await createBookViaApi(agent, csrf, {
    reorderPoint: 10,
    reorderQuantity: 30,
    defaultSupplier: String(supplier._id),
  });

  const book = await Book.findById(bookId).lean();
  assert.equal(book.reorderPoint, 10);
  assert.equal(book.reorderQuantity, 30);
  assert.equal(String(book.defaultSupplier), String(supplier._id));

  // The opening balance is recorded so reconciliation holds from the start.
  const opening = await StockLedger.findOne({ book: book._id }).lean();
  assert.equal(opening.quantity, 12);
  assert.equal(opening.stockBefore, 0);
  assert.equal(opening.stockAfter, 12);
});

test("editing a book updates reorder settings without touching stock", async () => {
  const { agent, csrf } = await adminAgent();
  const supplier = await Supplier.create({ code: "KIMDONG", name: "NXB Kim Dong" });
  const bookId = await createBookViaApi(agent, csrf);

  const updated = await agent
    .put(`/api/books/${bookId}`)
    .set("x-csrf-token", csrf)
    .send({
      reorderPoint: 25,
      reorderQuantity: 50,
      defaultSupplier: String(supplier._id),
    });

  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const book = await Book.findById(bookId).lean();
  assert.equal(book.reorderPoint, 25);
  assert.equal(book.reorderQuantity, 50);
  assert.equal(String(book.defaultSupplier), String(supplier._id));
  assert.equal(book.stock, 12, "an edit must leave stock exactly as it was");
});

test("an edit that includes stock is refused with a usable error code", async () => {
  const { agent, csrf } = await adminAgent();
  const bookId = await createBookViaApi(agent, csrf);

  const rejected = await agent
    .put(`/api/books/${bookId}`)
    .set("x-csrf-token", csrf)
    .send({ title: "Renamed", stock: 999 });

  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.code, "STOCK_NOT_DIRECTLY_EDITABLE");

  const book = await Book.findById(bookId).lean();
  assert.equal(book.stock, 12);
  assert.equal(book.title, "Warehouse Settings Book", "nothing may be applied");
});

test("costPrice cannot be set through the book form", async () => {
  const { agent, csrf } = await adminAgent();

  const bookId = await createBookViaApi(agent, csrf, { costPrice: 90_000 });

  const book = await Book.findById(bookId).lean();
  assert.equal(
    book.costPrice,
    0,
    "cost is derived from confirmed goods receipts, never typed in"
  );
});

test("a negative reorder threshold is rejected", async () => {
  const { agent, csrf } = await adminAgent();

  const imageUrl = await uploadCover(agent, csrf);

  const rejected = await agent
    .post("/api/books")
    .set("x-csrf-token", csrf)
    .send(bookPayload(imageUrl, { reorderPoint: -5 }));

  assert.equal(rejected.status, 400);
});

test("clearing the default supplier is accepted", async () => {
  const { agent, csrf } = await adminAgent();
  const supplier = await Supplier.create({ code: "TRE2", name: "NXB Tre 2" });
  const bookId = await createBookViaApi(agent, csrf, {
    defaultSupplier: String(supplier._id),
  });

  const cleared = await agent
    .put(`/api/books/${bookId}`)
    .set("x-csrf-token", csrf)
    .send({ defaultSupplier: null });

  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal((await Book.findById(bookId).lean()).defaultSupplier, null);
});

test("the admin book detail exposes the fields the form needs", async () => {
  const { agent, csrf } = await adminAgent();
  const supplier = await Supplier.create({ code: "TRE3", name: "NXB Tre 3" });
  const bookId = await createBookViaApi(agent, csrf, {
    reorderPoint: 7,
    reorderQuantity: 21,
    defaultSupplier: String(supplier._id),
  });

  const detail = await agent.get(`/api/books/${bookId}?raw=1`);

  assert.equal(detail.status, 200);
  const book = detail.body.data.book;
  assert.equal(book.reorderPoint, 7);
  assert.equal(book.reorderQuantity, 21);
  assert.equal(String(book.defaultSupplier), String(supplier._id));
  assert.equal(book.costPrice, 0);
});
