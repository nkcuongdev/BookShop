const mongoose = require("mongoose");
const { isKnownPermission } = require("../config/permissionCatalog");
const { WILDCARD } = require("../config/permissions");

/**
 * A staff role and the permissions it grants.
 *
 * Roles are data so admins can compose new ones at runtime; permissions are
 * code (config/permissionCatalog.js), because each one corresponds to a
 * requirePermission() gate in a route.
 *
 * Reads never touch this collection directly — services/roleRegistry.js caches
 * it, since requirePermission runs on every admin request.
 */
const roleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Mã vai trò là bắt buộc"],
      unique: true,
      trim: true,
      lowercase: true,
      // Used in URLs, socket room names and the User.role field, so keep it to
      // a slug. Leading letter avoids collisions with numeric-looking ids.
      match: [
        /^[a-z][a-z0-9_-]{1,31}$/,
        "Mã vai trò chỉ gồm chữ thường, số, gạch ngang hoặc gạch dưới (2-32 ký tự)",
      ],
    },
    label: {
      type: String,
      required: [true, "Tên vai trò là bắt buộc"],
      trim: true,
      maxlength: [60, "Tên vai trò tối đa 60 ký tự"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [300, "Mô tả tối đa 300 ký tự"],
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (permissions) =>
          permissions.every(
            (permission) => permission === WILDCARD || isKnownPermission(permission)
          ),
        message: "Danh sách quyền chứa mã không hợp lệ",
      },
    },
    // Ships with the product: cannot be deleted and its key cannot change.
    isSystem: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

/** Holding admin.access is what makes a role a staff role. */
roleSchema.virtual("isStaff").get(function () {
  return (
    this.permissions.includes(WILDCARD) || this.permissions.includes("admin.access")
  );
});

roleSchema.set("toJSON", { virtuals: true });
roleSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Role", roleSchema);
