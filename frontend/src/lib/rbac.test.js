import { describe, expect, it } from "vitest";
import { can, canAny, isStaff, roleLabel } from "./rbac";

// Permissions arrive from the API on the session object, so these tests work in
// the same terms: a user is whatever /api/auth/me returned. There is no local
// role table left to assert against — that is the point of the change.

const withPermissions = (permissions, extra = {}) => ({
  id: "u1",
  permissions,
  ...extra,
});

describe("can", () => {
  it("denies everything without a session", () => {
    expect(can(null, "admin.access")).toBe(false);
    expect(can(undefined, "dashboard.view")).toBe(false);
  });

  it("denies everything when the server sent no permission list", () => {
    // An older session payload, or a failed refresh: fail closed rather than
    // rendering controls the API will refuse.
    expect(can({ id: "u1", role: "admin" }, "user.manage")).toBe(false);
    expect(can(withPermissions(null), "user.manage")).toBe(false);
  });

  it("grants a permission that is present", () => {
    const user = withPermissions(["admin.access", "inventory.read"]);
    expect(can(user, "admin.access")).toBe(true);
    expect(can(user, "inventory.read")).toBe(true);
  });

  it("denies a permission that is absent", () => {
    const user = withPermissions(["admin.access", "inventory.read"]);
    expect(can(user, "inventory.adjust")).toBe(false);
    expect(can(user, "analytics.view")).toBe(false);
  });

  it("treats the wildcard as every permission", () => {
    const admin = withPermissions(["*"]);
    expect(can(admin, "user.manage")).toBe(true);
    expect(can(admin, "role.manage")).toBe(true);
    expect(can(admin, "some.permission.added.later")).toBe(true);
  });

  it("does not honour prefix wildcards", () => {
    const user = withPermissions(["inventory.*"]);
    expect(can(user, "inventory.read")).toBe(false);
  });

  it("grants nothing on an empty list", () => {
    expect(can(withPermissions([]), "admin.access")).toBe(false);
  });
});

describe("canAny", () => {
  it("passes when one of the permissions is held", () => {
    const warehouse = withPermissions(["admin.access", "order.fulfill"]);
    expect(canAny(warehouse, "order.support", "order.fulfill")).toBe(true);
  });

  it("fails when none are held", () => {
    const content = withPermissions(["admin.access", "post.write"]);
    expect(canAny(content, "order.support", "order.fulfill")).toBe(false);
  });

  it("passes for the wildcard and fails without a session", () => {
    expect(canAny(withPermissions(["*"]), "anything")).toBe(true);
    expect(canAny(null, "order.read")).toBe(false);
  });
});

describe("isStaff", () => {
  it("keys off admin.access rather than a role name", () => {
    expect(isStaff(withPermissions(["admin.access"]))).toBe(true);
    expect(isStaff(withPermissions(["*"]))).toBe(true);
    // A custom role created by an admin is staff on the same basis.
    expect(isStaff(withPermissions(["admin.access", "inventory.read"]))).toBe(true);

    expect(isStaff(withPermissions([]))).toBe(false);
    expect(isStaff(withPermissions(["book.read"]))).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});

describe("roleLabel", () => {
  it("prefers the label the server resolved", () => {
    expect(
      roleLabel(withPermissions([], { role: "headofstock", roleLabel: "Trưởng kho" }))
    ).toBe("Trưởng kho");
  });

  it("falls back to the role key, then to empty", () => {
    expect(roleLabel(withPermissions([], { role: "headofstock" }))).toBe("headofstock");
    expect(roleLabel(null)).toBe("");
  });
});
