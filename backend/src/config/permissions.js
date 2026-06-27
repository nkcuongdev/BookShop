/**
 * Default role definitions.
 *
 * Roles now live in MongoDB (models/Role.js) so admins can create and edit them
 * at runtime; every authorization check goes through services/roleRegistry.js.
 * This file remains for two jobs:
 *
 *   1. Source for the seedRoles migration, which upserts these as system roles.
 *   2. Deterministic fallback for isolated tests. Production authorization
 *      fails closed if the Role collection is empty or unreachable.
 *
 * The permission vocabulary itself lives in config/permissionCatalog.js.
 */

const { PERMISSIONS, sanitizePermissions } = require("./permissionCatalog");

const WILDCARD = "*";

/** Roles that ship with the product: never deletable, key never editable. */
const SYSTEM_ROLES = Object.freeze({
  admin: {
    label: "Quản trị viên",
    description: "Toàn quyền trên hệ thống.",
    // Wildcard rather than an enumerated list: a new permission must not
    // silently bypass the admin.
    permissions: [WILDCARD],
    // Editing this role's permissions could lock everyone out of the system.
    locked: true,
  },
  warehouse: {
    label: "Nhân viên kho",
    description: "Quản lý tồn kho, nhập xuất, nhà cung cấp và giao vận.",
    permissions: [
      "admin.access",
      "dashboard.view",
      "book.read",
      "inventory.read",
      "inventory.write",
      "inventory.adjust",
      "supplier.read",
      "supplier.write",
      "order.read",
      "order.fulfill",
      "upload.admin",
    ],
  },
  support: {
    label: "Chăm sóc khách hàng",
    description: "Xử lý ticket, chat và các vấn đề đơn hàng của khách.",
    permissions: [
      "admin.access",
      "dashboard.view",
      "book.read",
      "order.read",
      "order.support",
      "ticket.read",
      "ticket.write",
      "ticket.resolve",
      "chat.read",
      "chat.write",
      "customer.read",
      // So agents can answer "where did my points go?" without a second pair
      // of eyes. Adjusting them stays a separate, deliberately rarer grant.
      "loyalty.read",
      // Read-only stock so agents can answer availability questions.
      "inventory.read",
      "upload.admin",
    ],
  },
  content: {
    label: "Nhân viên nội dung",
    description: "Quản lý sách, danh mục, bài viết, newsletter và đánh giá.",
    permissions: [
      "admin.access",
      "dashboard.view",
      "book.read",
      "book.write",
      "book.delete",
      "category.manage",
      "post.read",
      "post.write",
      "post.publish",
      "postCategory.manage",
      "newsletter.manage",
      "review.moderate",
      "upload.admin",
    ],
  },
  accounting: {
    label: "Kế toán",
    description: "Xem doanh thu, xuất báo cáo và quản lý khuyến mãi.",
    permissions: [
      "admin.access",
      "dashboard.view",
      "analytics.view",
      "book.read",
      "order.read",
      "order.export",
      "order.payment.audit",
      "voucher.manage",
      "promotion.manage",
      "loyalty.read",
      "loyalty.manage",
      // Stock valuation feeds the books.
      "inventory.read",
    ],
  },
  user: {
    label: "Khách hàng",
    description: "Tài khoản mua hàng, không có quyền quản trị.",
    permissions: [],
    // The default role for every registration; must stay permission-free.
    locked: true,
  },
});

const SYSTEM_ROLE_KEYS = Object.freeze(Object.keys(SYSTEM_ROLES));

/** Keys whose permission set may never be edited, not even by an admin. */
const LOCKED_ROLE_KEYS = Object.freeze(
  SYSTEM_ROLE_KEYS.filter((key) => SYSTEM_ROLES[key].locked)
);

/** The role assigned to new registrations. */
const DEFAULT_ROLE = "user";

/**
 * Default matrix in the shape the registry caches, used as the fallback when
 * the database has no roles yet.
 */
const DEFAULT_ROLE_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    SYSTEM_ROLE_KEYS.map((key) => [
      key,
      Object.freeze(
        SYSTEM_ROLES[key].permissions.includes(WILDCARD)
          ? [WILDCARD]
          : sanitizePermissions(SYSTEM_ROLES[key].permissions)
      ),
    ])
  )
);

const DEFAULT_ROLE_LABELS = Object.freeze(
  Object.fromEntries(SYSTEM_ROLE_KEYS.map((key) => [key, SYSTEM_ROLES[key].label]))
);

module.exports = {
  DEFAULT_ROLE,
  DEFAULT_ROLE_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
  LOCKED_ROLE_KEYS,
  PERMISSIONS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_KEYS,
  WILDCARD,
};
