process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const User = require("../src/models/User");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test("admin user API rejects unknown roles instead of silently mapping them to user", async () => {
  const [admin, target] = await User.create([
    { name: "Admin", email: "strict-role-admin@example.com", password: "secure-password", role: "admin" },
    { name: "Target", email: "strict-role-target@example.com", password: "secure-password", role: "admin" },
  ]);
  const agent = supertest.agent(app);
  const login = await agent.post("/api/auth/login").send({
    email: admin.email,
    password: "secure-password",
  });
  assert.equal(login.status, 200);
  const csrf = login.body.data.csrfToken;

  const invalid = await agent
    .patch(`/api/admin/users/${target._id}/role`)
    .set("x-csrf-token", csrf)
    .send({ role: "superadmin" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "INVALID_ROLE");
  assert.equal((await User.findById(target._id)).role, "admin");

  const invalidFilter = await agent.get("/api/admin/users?role=superadmin");
  assert.equal(invalidFilter.status, 400);
  assert.equal(invalidFilter.body.code, "INVALID_ROLE");

  const valid = await agent
    .patch(`/api/admin/users/${target._id}/role`)
    .set("x-csrf-token", csrf)
    .send({ role: "customer" });
  assert.equal(valid.status, 200);
  assert.equal((await User.findById(target._id)).role, "user");
});
