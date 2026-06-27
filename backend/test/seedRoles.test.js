process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const Role = require("../src/models/Role");
const roleRegistry = require("../src/services/roleRegistry");
const { seedRoles } = require("../src/jobs/seedRoles");
const { SYSTEM_ROLE_KEYS } = require("../src/config/permissions");

// seedRoles runs on every server start, so it has to be idempotent AND must not
// revert an admin's edits to a system role — otherwise a deploy would silently
// undo their configuration.

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

test("seeding an empty database creates every system role", async () => {
  const result = await seedRoles();

  assert.deepEqual(result.created.sort(), [...SYSTEM_ROLE_KEYS].sort());
  const roles = await Role.find({}).lean();
  assert.equal(roles.length, SYSTEM_ROLE_KEYS.length);
  assert.ok(roles.every((role) => role.isSystem), "all seeded roles are system roles");

  const admin = roles.find((role) => role.key === "admin");
  assert.deepEqual(admin.permissions, ["*"]);
  const customer = roles.find((role) => role.key === "user");
  assert.deepEqual(customer.permissions, []);
});

test("seeding twice changes nothing", async () => {
  await seedRoles();
  const before = await Role.find({}).sort({ key: 1 }).lean();

  const second = await seedRoles();

  assert.deepEqual(second.created, []);
  assert.equal(second.repaired, 0);
  const after = await Role.find({}).sort({ key: 1 }).lean();
  assert.equal(after.length, before.length);
  assert.deepEqual(
    after.map((r) => r.key),
    before.map((r) => r.key)
  );
});

test("an admin's edits to a system role survive re-seeding", async () => {
  await seedRoles();
  await Role.updateOne(
    { key: "warehouse" },
    {
      $set: {
        label: "Kho vận",
        description: "Đã sửa",
        permissions: ["admin.access", "inventory.read"],
      },
    }
  );

  await seedRoles();

  const warehouse = await Role.findOne({ key: "warehouse" }).lean();
  assert.equal(warehouse.label, "Kho vận", "a deploy must not revert the label");
  assert.deepEqual(warehouse.permissions, ["admin.access", "inventory.read"]);
  assert.equal(warehouse.isSystem, true);
});

test("a role added in a later release is created without touching the others", async () => {
  await seedRoles();
  await Role.deleteOne({ key: "accounting" });

  const result = await seedRoles();

  assert.deepEqual(result.created, ["accounting"]);
  assert.equal(await Role.countDocuments({}), SYSTEM_ROLE_KEYS.length);
});

test("a system role missing its flag is repaired", async () => {
  await seedRoles();
  await Role.updateOne({ key: "support" }, { $set: { isSystem: false } });

  const result = await seedRoles();

  assert.equal(result.repaired, 1);
  const support = await Role.findOne({ key: "support" }).lean();
  assert.equal(support.isSystem, true);
});

test("seeding leaves custom roles alone", async () => {
  await Role.create({
    key: "headofstock",
    label: "Trưởng kho",
    permissions: ["admin.access", "inventory.read"],
  });

  await seedRoles();

  const custom = await Role.findOne({ key: "headofstock" }).lean();
  assert.equal(custom.isSystem, false, "a custom role must not become a system role");
  assert.equal(await Role.countDocuments({}), SYSTEM_ROLE_KEYS.length + 1);
});
