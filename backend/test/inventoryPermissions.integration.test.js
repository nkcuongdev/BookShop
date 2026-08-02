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
const Supplier = require("../src/models/Supplier");
const User = require("../src/models/User");

// The warehouse endpoints gate on permissions rather than on the admin role, so
// a stock keeper can run the warehouse without being handed the whole back
// office. These tests pin who can read, who can write, and who can post a
// manual adjustment — the one action that bypasses every source document.

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Book.syncIndexes(), Supplier.syncIndexes(), User.syncIndexes()]);
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

/** Log in as a user with the given role and return an authenticated agent. */
async function agentForRole(role) {
  const agent = supertest.agent(app);
  const credentials = {
    name: `${role} user`,
    email: `${role}-inventory@example.com`,
    password: "secure-password",
  };
  let authenticated = await agent.post("/api/auth/register").send(credentials);
  if (authenticated.status === 429) {
    await User.create({ ...credentials, role });
    authenticated = await agent.post("/api/auth/login").send({
      email: credentials.email,
      password: credentials.password,
    });
  }
  await User.updateOne({ email: credentials.email }, { $set: { role } });
  return { agent, csrf: authenticated.body.data.csrfToken };
}

async function seedBook(overrides = {}) {
  return Book.create({
    title: "Permission Test Book",
    author: "Author",
    category: "fiction",
    price: 100_000,
    stock: 10,
    status: "active",
    ...overrides,
  });
}

test("warehouse staff can read the ledger", async () => {
  const { agent } = await agentForRole("warehouse");

  const response = await agent.get("/api/admin/inventory/ledger");

  assert.equal(response.status, 200);
});

test("support staff get read-only stock access", async () => {
  const { agent, csrf } = await agentForRole("support");
  const supplier = await Supplier.create({ code: "TRE", name: "NXB Tre" });
  const book = await seedBook();

  // Reading is allowed so agents can answer availability questions.
  assert.equal((await agent.get("/api/admin/inventory/low-stock")).status, 200);

  // Writing is not.
  const created = await agent
    .post("/api/admin/stock-receipts")
    .set("x-csrf-token", csrf)
    .send({
      supplier: String(supplier._id),
      items: [{ book: String(book._id), quantity: 1, unitCost: 1_000 }],
    });

  assert.equal(created.status, 403);
});

test("content staff cannot reach the warehouse at all", async () => {
  const { agent } = await agentForRole("content");

  assert.equal((await agent.get("/api/admin/inventory/ledger")).status, 403);
  assert.equal((await agent.get("/api/admin/suppliers")).status, 403);
});

test("customers are refused outright", async () => {
  const { agent } = await agentForRole("user");

  assert.equal((await agent.get("/api/admin/inventory/ledger")).status, 403);
});

test("a manual adjustment needs inventory.adjust, not just write access", async () => {
  const book = await seedBook({ stock: 5 });

  // Warehouse holds inventory.adjust.
  const warehouse = await agentForRole("warehouse");
  const allowed = await warehouse.agent
    .post("/api/admin/inventory/adjust")
    .set("x-csrf-token", warehouse.csrf)
    .send({ bookId: String(book._id), quantity: 3, reason: "Kiem tra quyen" });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.equal((await Book.findById(book._id).lean()).stock, 8);

  // Accounting can read stock for valuation but must not move it.
  const accounting = await agentForRole("accounting");
  const refused = await accounting.agent
    .post("/api/admin/inventory/adjust")
    .set("x-csrf-token", accounting.csrf)
    .send({ bookId: String(book._id), quantity: 5, reason: "Khong duoc phep" });
  assert.equal(refused.status, 403);
  assert.equal(
    (await Book.findById(book._id).lean()).stock,
    8,
    "a refused request must not move stock"
  );
});

test("accounting can read the valuation it needs for the books", async () => {
  const { agent } = await agentForRole("accounting");

  const response = await agent.get("/api/admin/inventory/valuation");

  assert.equal(response.status, 200);
  assert.ok(response.body.data.valuation);
});

test("supplier writes are limited to roles holding supplier.write", async () => {
  const warehouse = await agentForRole("warehouse");
  const created = await warehouse.agent
    .post("/api/admin/suppliers")
    .set("x-csrf-token", warehouse.csrf)
    .send({ code: "NEWSUP", name: "Nha cung cap moi" });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const accounting = await agentForRole("accounting");
  const refused = await accounting.agent
    .post("/api/admin/suppliers")
    .set("x-csrf-token", accounting.csrf)
    .send({ code: "NOPE", name: "Khong duoc phep" });
  assert.equal(refused.status, 403);
});
