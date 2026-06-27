const express = require("express");
const Role = require("../models/Role");
const User = require("../models/User");
const { auth, requirePermission } = require("../middleware/auth");
const {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSION_GROUPS,
  sanitizePermissions,
} = require("../config/permissionCatalog");
const { LOCKED_ROLE_KEYS, WILDCARD } = require("../config/permissions");
const roleRegistry = require("../services/roleRegistry");

const router = express.Router();

const badRequest = (res, code, message) =>
  res.status(400).json({ success: false, code, message });

const serializeRole = (role, userCount = 0) => {
  const permissions = role.permissions || [];
  return {
    key: role.key,
    label: role.label,
    description: role.description || "",
    permissions,
    isSystem: Boolean(role.isSystem),
    isLocked: LOCKED_ROLE_KEYS.includes(role.key),
    isStaff: permissions.includes(WILDCARD) || permissions.includes("admin.access"),
    userCount,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
};

/** How many accounts hold each role, so the UI can warn before a delete. */
async function countUsersByRole() {
  const rows = await User.aggregate([
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

/**
 * Shared validation for create and update.
 *
 * The self-lockout guards matter most: an admin editing permissions through a
 * checkbox UI can strip their own access very easily, and recovering from that
 * needs database surgery.
 */
async function validateWrite(req, { role, key, permissions }) {
  if (role && LOCKED_ROLE_KEYS.includes(role.key)) {
    return {
      code: "ROLE_LOCKED",
      message:
        role.key === "admin"
          ? "Không thể sửa quyền của vai trò quản trị viên"
          : "Không thể sửa quyền của vai trò khách hàng",
    };
  }

  if (permissions) {
    // No privilege escalation: a role manager may only delegate permissions
    // they already hold. The built-in admin wildcard naturally satisfies this
    // check, while delegated role managers cannot mint sensitive authority.
    const notHeld = [];
    for (const permission of permissions) {
      if (!(await roleRegistry.roleHasPermission(req.user.role, permission))) {
        notHeld.push(permission);
      }
    }
    if (notHeld.length) {
      return {
        code: "PERMISSION_NOT_HELD",
        message: `Bạn không thể cấp quyền mình không có: ${notHeld.join(", ")}`,
      };
    }
  }

  // Editing the role you are signed in with must not remove your way back.
  if (permissions && key && String(req.user.role) === String(key)) {
    if (!permissions.includes("admin.access")) {
      return {
        code: "SELF_LOCKOUT",
        message: "Không thể bỏ quyền vào khu quản trị của vai trò bạn đang dùng",
      };
    }
    if (!permissions.includes("role.manage")) {
      return {
        code: "SELF_LOCKOUT",
        message: "Không thể bỏ quyền sửa vai trò của vai trò bạn đang dùng",
      };
    }
  }

  return null;
}

const validationMessage = (error) =>
  Object.values(error.errors)[0]?.message || "Dữ liệu không hợp lệ";

// ── Catalogue ───────────────────────────────────────────────────
// Declared before "/:key" so these literal paths are not read as role keys.

// GET /api/admin/roles/permissions — the permission vocabulary for the UI
router.get("/permissions", auth, requirePermission("role.read"), (_req, res) => {
  res.json({
    success: true,
    data: { groups: PERMISSION_GROUPS, adminOnly: ADMIN_ONLY_PERMISSIONS },
  });
});

// GET /api/admin/roles/me — the signed-in user's own permissions.
// Auth only: every staff member must be able to see what they hold.
router.get("/me", auth, async (req, res, next) => {
  try {
    const [permissions, label, isStaff, role] = await Promise.all([
      roleRegistry.permissionsForRole(req.user.role),
      roleRegistry.roleLabel(req.user.role),
      roleRegistry.isStaffRole(req.user.role),
      Role.findOne({ key: req.user.role }).select("description").lean(),
    ]);
    res.json({
      success: true,
      data: {
        role: req.user.role,
        roleLabel: label,
        roleDescription: role?.description || "",
        permissions,
        isStaff,
        groups: PERMISSION_GROUPS,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── Role management ─────────────────────────────────────────────

// GET /api/admin/roles
router.get("/", auth, requirePermission("role.read"), async (_req, res, next) => {
  try {
    const [roles, counts] = await Promise.all([
      Role.find({}).sort({ isSystem: -1, key: 1 }).lean(),
      countUsersByRole(),
    ]);
    res.json({
      success: true,
      data: {
        roles: roles.map((role) => serializeRole(role, counts[role.key] || 0)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/roles
router.post("/", auth, requirePermission("role.manage"), async (req, res, next) => {
  try {
    const permissions = sanitizePermissions(req.body?.permissions);
    const key = String(req.body?.key || "").trim().toLowerCase();

    if (await roleRegistry.roleExists(key)) {
      return badRequest(res, "ROLE_EXISTS", "Mã vai trò này đã tồn tại");
    }

    const problem = await validateWrite(req, { permissions });
    if (problem) return badRequest(res, problem.code, problem.message);

    const role = await Role.create({
      key,
      label: req.body?.label,
      description: req.body?.description,
      permissions,
      isSystem: false,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    roleRegistry.invalidate();

    res.status(201).json({ success: true, data: { role: serializeRole(role) } });
  } catch (error) {
    if (error.name === "ValidationError") {
      return badRequest(res, "VALIDATION_ERROR", validationMessage(error));
    }
    if (error.code === 11000) {
      return badRequest(res, "ROLE_EXISTS", "Mã vai trò này đã tồn tại");
    }
    next(error);
  }
});

// PUT /api/admin/roles/:key
router.put("/:key", auth, requirePermission("role.manage"), async (req, res, next) => {
  try {
    const role = await Role.findOne({ key: req.params.key });
    if (!role) {
      return res.status(404).json({ success: false, message: "Không tìm thấy vai trò" });
    }

    const editsPermissions = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "permissions"
    );
    const permissions = editsPermissions
      ? sanitizePermissions(req.body.permissions)
      : null;

    const problem = await validateWrite(req, { role, key: role.key, permissions });
    if (problem) return badRequest(res, problem.code, problem.message);

    if (req.body?.label !== undefined) role.label = req.body.label;
    if (req.body?.description !== undefined) role.description = req.body.description;
    if (permissions) role.permissions = permissions;
    role.updatedBy = req.user._id;
    await role.save();
    roleRegistry.invalidate();

    const counts = await countUsersByRole();
    res.json({
      success: true,
      data: { role: serializeRole(role, counts[role.key] || 0) },
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return badRequest(res, "VALIDATION_ERROR", validationMessage(error));
    }
    next(error);
  }
});

// DELETE /api/admin/roles/:key
router.delete("/:key", auth, requirePermission("role.manage"), async (req, res, next) => {
  try {
    const role = await Role.findOne({ key: req.params.key });
    if (!role) {
      return res.status(404).json({ success: false, message: "Không tìm thấy vai trò" });
    }
    if (role.isSystem) {
      return badRequest(res, "ROLE_SYSTEM", "Không thể xoá vai trò mặc định của hệ thống");
    }
    if (String(req.user.role) === String(role.key)) {
      return badRequest(res, "SELF_LOCKOUT", "Không thể xoá vai trò bạn đang sử dụng");
    }

    // Deleting a role in use would leave those accounts holding a key that
    // grants nothing — locked out with no explanation. Move them first.
    const userCount = await User.countDocuments({ role: role.key });
    if (userCount > 0) {
      return badRequest(
        res,
        "ROLE_IN_USE",
        `Còn ${userCount} tài khoản đang giữ vai trò này. Hãy chuyển họ sang vai trò khác trước khi xoá.`
      );
    }

    await role.deleteOne();
    roleRegistry.invalidate();
    res.json({ success: true, data: { key: role.key } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
