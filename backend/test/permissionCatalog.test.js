process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  isKnownPermission,
  sanitizePermissions,
} = require("../src/config/permissionCatalog");
const {
  DEFAULT_ROLE,
  DEFAULT_ROLE_PERMISSIONS,
  LOCKED_ROLE_KEYS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_KEYS,
  WILDCARD,
} = require("../src/config/permissions");

// The catalogue is the permission vocabulary: admins compose roles out of it but
// cannot invent entries, because each key corresponds to a requirePermission()
// gate in a route.

test("catalogue keys are unique and every entry is documented", () => {
  assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length, "duplicate keys");
  for (const group of PERMISSION_GROUPS) {
    assert.ok(group.group, "a group is missing its name");
    assert.ok(group.items.length, `group ${group.group} is empty`);
    for (const item of group.items) {
      assert.ok(item.label, `${item.key} has no label`);
      assert.ok(item.description, `${item.key} has no description`);
    }
  }
});

test("sanitizePermissions drops unknown keys and keeps catalogue order", () => {
  assert.deepEqual(
    sanitizePermissions(["book.write", "not.a.permission", "book.read"]),
    ["book.read", "book.write"]
  );
  assert.deepEqual(sanitizePermissions(null), []);
  assert.deepEqual(sanitizePermissions([WILDCARD]), [], "wildcard is not a grantable key");
});

test("the admin-only permissions are exactly the system ones", () => {
  assert.deepEqual([...ADMIN_ONLY_PERMISSIONS].sort(), [
    "audit.read",
    "role.manage",
    "role.read",
    "user.manage",
    "user.role.assign",
  ]);
});

test("sensitive permissions cover money, deletion and privacy", () => {
  const sensitive = new Set(
    PERMISSION_GROUPS.flatMap((group) =>
      group.items.filter((item) => item.sensitive).map((item) => item.key)
    )
  );
  for (const key of [
    "analytics.view",
    "book.delete",
    "inventory.adjust",
    "order.export",
    "order.payment.audit",
    "role.manage",
    "user.manage",
    "user.role.assign",
  ]) {
    assert.ok(sensitive.has(key), `${key} should be marked sensitive`);
  }
});

test("every default role grants only known permissions", () => {
  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      assert.ok(
        permission === WILDCARD || isKnownPermission(permission),
        `role ${role} grants unknown permission ${permission}`
      );
    }
  }
});

test("admin holds the wildcard and customers hold nothing", () => {
  assert.deepEqual(DEFAULT_ROLE_PERMISSIONS.admin, [WILDCARD]);
  assert.deepEqual(DEFAULT_ROLE_PERMISSIONS[DEFAULT_ROLE], []);
});

test("admin and the customer role are locked against edits", () => {
  assert.deepEqual([...LOCKED_ROLE_KEYS].sort(), ["admin", "user"]);
});

test("no default staff role may manage users or roles", () => {
  for (const key of SYSTEM_ROLE_KEYS) {
    if (key === "admin") continue;
    for (const permission of ADMIN_ONLY_PERMISSIONS) {
      assert.ok(
        !DEFAULT_ROLE_PERMISSIONS[key].includes(permission),
        `${key} must not hold ${permission}`
      );
    }
  }
});

test("order duties are split between support and warehouse by default", () => {
  const support = DEFAULT_ROLE_PERMISSIONS.support;
  const warehouse = DEFAULT_ROLE_PERMISSIONS.warehouse;
  assert.ok(support.includes("order.support"));
  assert.ok(!support.includes("order.fulfill"));
  assert.ok(warehouse.includes("order.fulfill"));
  assert.ok(!warehouse.includes("order.support"));
});

test("only admin and accounting see financial figures by default", () => {
  const withMoney = SYSTEM_ROLE_KEYS.filter(
    (key) =>
      DEFAULT_ROLE_PERMISSIONS[key].includes(WILDCARD) ||
      DEFAULT_ROLE_PERMISSIONS[key].includes("analytics.view")
  );
  assert.deepEqual(withMoney.sort(), ["accounting", "admin"]);
});

test("every system role has a label and a description", () => {
  for (const key of SYSTEM_ROLE_KEYS) {
    assert.ok(SYSTEM_ROLES[key].label, `${key} has no label`);
    assert.ok(SYSTEM_ROLES[key].description, `${key} has no description`);
  }
});
