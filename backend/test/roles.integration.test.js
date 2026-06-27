process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Role = require("../src/models/Role");
const User = require("../src/models/User");
const roleRegistry = require("../src/services/roleRegistry");
const { seedRoles } = require("../src/jobs/seedRoles");

// Roles are data now, so an admin can compose them through the API. These tests
// pin the guards that keep that from going wrong — above all the ones stopping
// an admin from removing their own way back in, which is unrecoverable without
// database surgery.

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Role.syncIndexes(), User.syncIndexes()]);
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
  roleRegistry.invalidate();
  await seedRoles();
});

/** Log in as a user with the given role and return an authenticated agent. */
async function agentForRole(role) {
  const agent = supertest.agent(app);
  const credentials = {
    name: `${role} user`,
    email: `${role}-roles@example.com`,
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

test("the role list reports how many accounts hold each role", async () => {
  const { agent } = await agentForRole("admin");
  await User.create({
    name: "Kho 1",
    email: "kho1@example.com",
    password: "secure-password",
    role: "warehouse",
  });

  const response = await agent.get("/api/admin/roles");

  assert.equal(response.status, 200);
  const roles = response.body.data.roles;
  assert.equal(roles.length, 6);
  const warehouse = roles.find((role) => role.key === "warehouse");
  assert.equal(warehouse.userCount, 1);
  assert.equal(warehouse.isSystem, true);
  assert.equal(warehouse.isStaff, true);
  const customer = roles.find((role) => role.key === "user");
  assert.equal(customer.isStaff, false);
  assert.equal(customer.isLocked, true);
});

test("only admins may read or manage roles", async () => {
  for (const role of ["warehouse", "support", "content", "accounting"]) {
    const { agent, csrf } = await agentForRole(role);
    assert.equal((await agent.get("/api/admin/roles")).status, 403, role);
    assert.equal((await agent.get("/api/admin/roles/permissions")).status, 403, role);
    const created = await agent
      .post("/api/admin/roles")
      .set("x-csrf-token", csrf)
      .send({ key: "sneaky", label: "Sneaky", permissions: ["admin.access"] });
    assert.equal(created.status, 403, role);
  }
  assert.equal(await Role.countDocuments({ key: "sneaky" }), 0);
});

test("a new role takes effect immediately for the accounts holding it", async () => {
  const { agent, csrf } = await agentForRole("admin");

  const created = await agent
    .post("/api/admin/roles")
    .set("x-csrf-token", csrf)
    .send({
      key: "headofstock",
      label: "Trưởng kho",
      description: "Kho cộng doanh thu",
      permissions: [
        "admin.access",
        "dashboard.view",
        "analytics.view",
        "inventory.read",
      ],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const staff = await agentForRole("headofstock");
  // analytics.view is granted, so the revenue endpoints open up...
  assert.equal((await staff.agent.get("/api/admin/analytics/funnel")).status, 200);
  // ...while inventory.write, which the role does not hold, stays shut.
  assert.equal((await staff.agent.get("/api/admin/inventory/ledger")).status, 200);
  const receipt = await staff.agent
    .post("/api/admin/stock-receipts")
    .set("x-csrf-token", staff.csrf)
    .send({ supplier: String(new mongoose.Types.ObjectId()), items: [] });
  assert.equal(receipt.status, 403);
});

test("editing a role changes what its holders can do", async () => {
  const admin = await agentForRole("admin");
  const warehouse = await agentForRole("warehouse");

  const before = await warehouse.agent
    .post("/api/admin/inventory/adjust")
    .set("x-csrf-token", warehouse.csrf)
    .send({ bookId: String(new mongoose.Types.ObjectId()), quantity: 1, reason: "x" });
  assert.notEqual(before.status, 403, "warehouse starts with inventory.adjust");

  const updated = await admin.agent
    .put("/api/admin/roles/warehouse")
    .set("x-csrf-token", admin.csrf)
    .send({ permissions: ["admin.access", "dashboard.view", "inventory.read"] });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));

  const after = await warehouse.agent
    .post("/api/admin/inventory/adjust")
    .set("x-csrf-token", warehouse.csrf)
    .send({ bookId: String(new mongoose.Types.ObjectId()), quantity: 1, reason: "x" });
  assert.equal(after.status, 403, "the permission was revoked");
});

test("the admin and customer roles are locked against permission edits", async () => {
  const { agent, csrf } = await agentForRole("admin");

  for (const key of ["admin", "user"]) {
    const response = await agent
      .put(`/api/admin/roles/${key}`)
      .set("x-csrf-token", csrf)
      .send({ permissions: ["admin.access"] });
    assert.equal(response.status, 400, key);
    assert.equal(response.body.code, "ROLE_LOCKED");
  }

  const admin = await Role.findOne({ key: "admin" }).lean();
  assert.deepEqual(admin.permissions, ["*"], "the admin grant is untouched");
});

test("reserved permissions cannot be granted by someone who lacks them", async () => {
  // An admin holds the wildcard, so they may delegate these to a new role —
  // that is how a second admin-capable role gets created.
  const admin = await agentForRole("admin");
  const delegated = await admin.agent
    .post("/api/admin/roles")
    .set("x-csrf-token", admin.csrf)
    .send({
      key: "coadmin",
      label: "Quản trị phụ",
      permissions: ["admin.access", "role.read", "role.manage", "user.manage"],
    });
  assert.equal(delegated.status, 201, JSON.stringify(delegated.body));

  // That new role can manage roles, but cannot mint authority it lacks.
  await User.create({
    name: "Co admin",
    email: "coadmin@example.com",
    password: "secure-password",
    role: "coadmin",
  });
  await Role.updateOne(
    { key: "coadmin" },
    { $set: { permissions: ["admin.access", "role.read", "role.manage"] } }
  );
  roleRegistry.invalidate();

  const co = supertest.agent(app);
  const login = await co
    .post("/api/auth/login")
    .send({ email: "coadmin@example.com", password: "secure-password" });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const escalation = await co
    .post("/api/admin/roles")
    .set("x-csrf-token", login.body.data.csrfToken)
    .send({
      key: "escalated",
      label: "Leo thang",
      // coadmin no longer holds user.manage, so it must not hand it out.
      permissions: ["admin.access", "user.manage"],
    });
  assert.equal(escalation.status, 400);
  assert.equal(escalation.body.code, "PERMISSION_NOT_HELD");
  assert.equal(await Role.countDocuments({ key: "escalated" }), 0);
});

test("an admin cannot strip their own role of admin access or role management", async () => {
  const { agent, csrf } = await agentForRole("admin");
  // A second admin role that the signed-in user actually holds, since the
  // built-in one is locked outright.
  await Role.create({
    key: "superadmin",
    label: "Quản trị cấp cao",
    permissions: ["admin.access", "role.read", "role.manage", "user.manage"],
  });
  await User.updateOne(
    { email: "admin-roles@example.com" },
    { $set: { role: "superadmin" } }
  );
  roleRegistry.invalidate();

  const droppedAccess = await agent
    .put("/api/admin/roles/superadmin")
    .set("x-csrf-token", csrf)
    .send({ permissions: ["role.read", "role.manage"] });
  assert.equal(droppedAccess.status, 400);
  assert.equal(droppedAccess.body.code, "SELF_LOCKOUT");

  const droppedManage = await agent
    .put("/api/admin/roles/superadmin")
    .set("x-csrf-token", csrf)
    .send({ permissions: ["admin.access", "role.read"] });
  assert.equal(droppedManage.status, 400);
  assert.equal(droppedManage.body.code, "SELF_LOCKOUT");

  const role = await Role.findOne({ key: "superadmin" }).lean();
  assert.ok(role.permissions.includes("role.manage"), "the grant survived");
});

test("system roles cannot be deleted", async () => {
  const { agent, csrf } = await agentForRole("admin");

  for (const key of ["admin", "user", "warehouse"]) {
    const response = await agent
      .delete(`/api/admin/roles/${key}`)
      .set("x-csrf-token", csrf);
    assert.equal(response.status, 400, key);
    assert.equal(response.body.code, "ROLE_SYSTEM");
  }
  assert.equal(await Role.countDocuments({}), 6);
});

test("a role still held by an account cannot be deleted", async () => {
  const { agent, csrf } = await agentForRole("admin");
  await Role.create({
    key: "headofstock",
    label: "Trưởng kho",
    permissions: ["admin.access", "inventory.read"],
  });
  await User.create({
    name: "Trưởng kho",
    email: "hos@example.com",
    password: "secure-password",
    role: "headofstock",
  });

  const refused = await agent
    .delete("/api/admin/roles/headofstock")
    .set("x-csrf-token", csrf);
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, "ROLE_IN_USE");
  assert.match(refused.body.message, /1 tài khoản/);

  // Move the holder away, then the delete goes through.
  await User.updateOne({ email: "hos@example.com" }, { $set: { role: "warehouse" } });
  const deleted = await agent
    .delete("/api/admin/roles/headofstock")
    .set("x-csrf-token", csrf);
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.equal(await Role.countDocuments({ key: "headofstock" }), 0);
});

test("unknown permissions and malformed keys are rejected", async () => {
  const { agent, csrf } = await agentForRole("admin");

  // Unknown permissions are dropped rather than stored.
  const created = await agent
    .post("/api/admin/roles")
    .set("x-csrf-token", csrf)
    .send({
      key: "custom",
      label: "Tuỳ chỉnh",
      permissions: ["admin.access", "not.a.real.permission"],
    });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.data.role.permissions, ["admin.access"]);

  for (const key of ["A", "1bad", "has space", "way-too-long-".repeat(5)]) {
    const response = await agent
      .post("/api/admin/roles")
      .set("x-csrf-token", csrf)
      .send({ key, label: "Thử", permissions: [] });
    assert.equal(response.status, 400, `key ${key} should be refused`);
  }

  const duplicate = await agent
    .post("/api/admin/roles")
    .set("x-csrf-token", csrf)
    .send({ key: "custom", label: "Trùng", permissions: [] });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.code, "ROLE_EXISTS");
});

test("every staff member can read their own permissions", async () => {
  for (const role of ["warehouse", "support", "content", "accounting"]) {
    const { agent } = await agentForRole(role);
    const response = await agent.get("/api/admin/roles/me");

    assert.equal(response.status, 200, role);
    assert.equal(response.body.data.role, role);
    assert.equal(response.body.data.isStaff, true);
    assert.ok(response.body.data.permissions.includes("admin.access"));
    assert.ok(response.body.data.roleLabel, "the role is named");
    assert.ok(response.body.data.groups.length, "the catalogue is included");
  }

  // A customer may read the endpoint too; it just reports no permissions.
  const customer = await agentForRole("user");
  const response = await customer.agent.get("/api/admin/roles/me");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.isStaff, false);
  assert.deepEqual(response.body.data.permissions, []);
});

test("the session payload carries the effective permissions", async () => {
  const { agent } = await agentForRole("support");

  const me = await agent.get("/api/auth/me");

  assert.equal(me.status, 200);
  const user = me.body.data.user;
  assert.equal(user.role, "support");
  assert.equal(user.roleLabel, "Chăm sóc khách hàng");
  assert.ok(user.permissions.includes("ticket.resolve"));
  assert.ok(!user.permissions.includes("analytics.view"));
});

test("assigning a role that does not exist is refused", async () => {
  const { agent, csrf } = await agentForRole("admin");
  const target = await User.create({
    name: "Khách",
    email: "target@example.com",
    password: "secure-password",
  });

  const refused = await agent
    .patch(`/api/admin/users/${target._id}/role`)
    .set("x-csrf-token", csrf)
    .send({ role: "nosuchrole" });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, "INVALID_ROLE");

  // A role created moments ago is assignable straight away.
  await Role.create({
    key: "headofstock",
    label: "Trưởng kho",
    permissions: ["admin.access", "inventory.read"],
  });
  roleRegistry.invalidate();

  const assigned = await agent
    .patch(`/api/admin/users/${target._id}/role`)
    .set("x-csrf-token", csrf)
    .send({ role: "headofstock" });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  assert.equal(assigned.body.data.user.role, "headofstock");
  assert.equal(assigned.body.data.user.roleLabel, "Trưởng kho");
});
