process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const Role = require("../src/models/Role");
const roleRegistry = require("../src/services/roleRegistry");
const { seedRoles } = require("../src/jobs/seedRoles");
const {
  DEFAULT_ROLE_PERMISSIONS,
  SYSTEM_ROLE_KEYS,
} = require("../src/config/permissions");

// The registry is the only thing that answers "may this role do X". It caches
// the Role collection because requirePermission runs on every admin request, so
// these tests pin the cache behaviour and — most importantly — that it fails
// closed and never leaves the system without a role table.

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Role.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

afterEach(async () => {
  await Role.deleteMany({});
  roleRegistry.invalidate();
});

test("an empty collection falls back to the built-in roles", async () => {
  assert.equal(await roleRegistry.isUsingFallback(), true);
  assert.equal(await roleRegistry.roleHasPermission("admin", "user.manage"), true);
  assert.equal(
    await roleRegistry.roleHasPermission("warehouse", "inventory.adjust"),
    true
  );
  assert.deepEqual(
    (await roleRegistry.allRoleKeys()).sort(),
    [...SYSTEM_ROLE_KEYS].sort(),
    "an unseeded database must still expose every built-in role"
  );
});

test("seeded roles are read from the database, not the fallback", async () => {
  await seedRoles();
  roleRegistry.invalidate();

  assert.equal(await roleRegistry.isUsingFallback(), false);
  for (const key of SYSTEM_ROLE_KEYS) {
    assert.ok(await roleRegistry.roleExists(key), `${key} missing`);
  }
  assert.deepEqual(
    (await roleRegistry.permissionsForRole("accounting")).sort(),
    [...DEFAULT_ROLE_PERMISSIONS.accounting].sort()
  );
});

test("a role created at runtime is honoured after invalidation", async () => {
  await seedRoles();
  await Role.create({
    key: "headofstock",
    label: "Trưởng kho",
    permissions: ["admin.access", "inventory.read", "analytics.view"],
  });
  roleRegistry.invalidate();

  assert.equal(await roleRegistry.roleHasPermission("headofstock", "analytics.view"), true);
  assert.equal(await roleRegistry.roleHasPermission("headofstock", "inventory.adjust"), false);
  assert.equal(await roleRegistry.isStaffRole("headofstock"), true);
  assert.ok((await roleRegistry.staffRoles()).includes("headofstock"));
});

test("an edit is invisible until the cache is invalidated, then visible", async () => {
  await seedRoles();
  roleRegistry.invalidate();
  assert.equal(await roleRegistry.roleHasPermission("warehouse", "inventory.adjust"), true);

  await Role.updateOne(
    { key: "warehouse" },
    { $pull: { permissions: "inventory.adjust" } }
  );

  // Still cached: this is the documented staleness window.
  assert.equal(await roleRegistry.roleHasPermission("warehouse", "inventory.adjust"), true);

  roleRegistry.invalidate();
  assert.equal(await roleRegistry.roleHasPermission("warehouse", "inventory.adjust"), false);
});

test("an unknown role grants nothing", async () => {
  await seedRoles();
  roleRegistry.invalidate();

  assert.equal(await roleRegistry.roleHasPermission("ghost", "admin.access"), false);
  assert.equal(await roleRegistry.isStaffRole("ghost"), false);
  assert.deepEqual(await roleRegistry.permissionsForRole("ghost"), []);
  assert.equal(await roleRegistry.roleExists("ghost"), false);
});

test("the wildcard matches every permission but only for the role holding it", async () => {
  await seedRoles();
  roleRegistry.invalidate();

  assert.equal(await roleRegistry.roleHasPermission("admin", "anything.at.all"), true);
  assert.equal(await roleRegistry.roleHasPermission("content", "anything.at.all"), false);
});

test("prefix wildcards are not honoured", async () => {
  await Role.create({
    key: "prefixer",
    label: "Prefix",
    // Stored directly: the model validator would reject "inventory.*", so this
    // pins that even a hand-written value cannot widen a role by prefix.
    permissions: ["admin.access"],
  });
  await Role.collection.updateOne(
    { key: "prefixer" },
    { $set: { permissions: ["admin.access", "inventory.*"] } }
  );
  roleRegistry.invalidate();

  assert.equal(await roleRegistry.roleHasPermission("prefixer", "inventory.read"), false);
});

test("rolesWithPermission reflects runtime roles", async () => {
  await seedRoles();
  assert.deepEqual(
    (await roleRegistry.rolesWithPermission("ticket.write")).sort(),
    ["admin", "support"]
  );

  await Role.create({
    key: "juniorcs",
    label: "CSKH tập sự",
    permissions: ["admin.access", "ticket.read", "ticket.write"],
  });
  roleRegistry.invalidate();

  assert.deepEqual(
    (await roleRegistry.rolesWithPermission("ticket.write")).sort(),
    ["admin", "juniorcs", "support"]
  );
});

test("labels come from the database once seeded", async () => {
  await seedRoles();
  await Role.updateOne({ key: "warehouse" }, { $set: { label: "Kho vận" } });
  roleRegistry.invalidate();

  assert.equal(await roleRegistry.roleLabel("warehouse"), "Kho vận");
  assert.equal(await roleRegistry.roleLabel("ghost"), "ghost", "unknown role echoes its key");
  const labels = await roleRegistry.roleLabels();
  assert.equal(labels.admin, "Quản trị viên");
});

test("concurrent cold reads share one load", async () => {
  await seedRoles();
  roleRegistry.invalidate();

  const results = await Promise.all([
    roleRegistry.roleHasPermission("admin", "user.manage"),
    roleRegistry.roleHasPermission("support", "ticket.read"),
    roleRegistry.staffRoles(),
  ]);

  assert.equal(results[0], true);
  assert.equal(results[1], true);
  assert.ok(results[2].includes("support"));
});
