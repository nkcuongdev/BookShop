const Role = require("../models/Role");
const { SYSTEM_ROLES, SYSTEM_ROLE_KEYS } = require("../config/permissions");
const roleRegistry = require("../services/roleRegistry");

/**
 * Upsert the built-in roles so a fresh database has them and an existing one
 * gains any role added in a later release.
 *
 * Idempotent and non-destructive: an admin's edits to a system role's label,
 * description or permissions are preserved on restart. Only the row's existence
 * and its isSystem flag are enforced — otherwise every deploy would silently
 * revert customer configuration.
 */
async function seedRoles() {
  const existing = await Role.find({ key: { $in: SYSTEM_ROLE_KEYS } })
    .select("key")
    .lean();
  const present = new Set(existing.map((role) => role.key));

  const missing = SYSTEM_ROLE_KEYS.filter((key) => !present.has(key));

  if (missing.length) {
    await Role.insertMany(
      missing.map((key) => ({
        key,
        label: SYSTEM_ROLES[key].label,
        description: SYSTEM_ROLES[key].description,
        permissions: SYSTEM_ROLES[key].permissions,
        isSystem: true,
      })),
      { ordered: false }
    );
  }

  // Repairs rows created before this flag existed, or hand-edited ones.
  const flagged = await Role.updateMany(
    { key: { $in: SYSTEM_ROLE_KEYS }, isSystem: { $ne: true } },
    { $set: { isSystem: true } }
  );

  if (missing.length || flagged.modifiedCount) roleRegistry.invalidate();

  return { created: missing, repaired: flagged.modifiedCount || 0 };
}

module.exports = { seedRoles };
