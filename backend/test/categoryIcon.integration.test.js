process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Category = require("../src/models/Category");
const User = require("../src/models/User");

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([User.syncIndexes(), Category.syncIndexes()]);
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
  await User.updateOne({ email: "admin@example.com" }, { $set: { role: "admin" } });
  return { agent, csrf: registered.body.data.csrfToken };
}

test("a category stores, updates and clears its icon key", async () => {
  const { agent, csrf } = await adminAgent();

  const created = await agent
    .post("/api/categories")
    .set("x-csrf-token", csrf)
    .send({ name: "Văn học", slug: "van-hoc", icon: " Feather " });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.category.icon, "feather");
  const id = created.body.data.category._id;

  const listed = await agent.get("/api/categories");
  assert.equal(listed.body.data.categories[0].icon, "feather");

  // Updating other fields leaves the icon alone.
  const renamed = await agent
    .put(`/api/categories/${id}`)
    .set("x-csrf-token", csrf)
    .send({ name: "Văn học Việt" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.category.icon, "feather");

  const changed = await agent
    .put(`/api/categories/${id}`)
    .set("x-csrf-token", csrf)
    .send({ icon: "trending-up" });
  assert.equal(changed.body.data.category.icon, "trending-up");

  // An empty key means "pick automatically" on the storefront.
  const cleared = await agent
    .put(`/api/categories/${id}`)
    .set("x-csrf-token", csrf)
    .send({ icon: "" });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.category.icon, "");
});

test("a category without an icon defaults to an empty key", async () => {
  const { agent, csrf } = await adminAgent();
  const created = await agent
    .post("/api/categories")
    .set("x-csrf-token", csrf)
    .send({ name: "Kinh tế", slug: "kinh-te" });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.category.icon, "");
});

test("malformed icon keys are rejected", async () => {
  const { agent, csrf } = await adminAgent();
  for (const icon of ["<svg>", "two words", "-lead", "a".repeat(41), 42]) {
    const res = await agent
      .post("/api/categories")
      .set("x-csrf-token", csrf)
      .send({ name: "Bad", slug: "bad", icon });
    assert.equal(res.status, 400, `icon ${JSON.stringify(icon)} should be rejected`);
  }
  assert.equal(await Category.countDocuments(), 0);

  const created = await agent
    .post("/api/categories")
    .set("x-csrf-token", csrf)
    .send({ name: "Ok", slug: "ok" });
  const res = await agent
    .put(`/api/categories/${created.body.data.category._id}`)
    .set("x-csrf-token", csrf)
    .send({ icon: "javascript:alert(1)" });
  assert.equal(res.status, 400);
  assert.equal((await Category.findOne({ slug: "ok" })).icon, "");
});
