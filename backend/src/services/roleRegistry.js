const mongoose = require("mongoose");
const Role = require("../models/Role");
const {
  DEFAULT_ROLE,
  DEFAULT_ROLE_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
  WILDCARD,
} = require("../config/permissions");

/**
 * Cached view of the Role collection. Every authorization decision reads from
 * here, so it must answer from memory: requirePermission runs on each admin
 * request and cannot afford a query.
 *
 * Freshness trade-off: a write invalidates the cache on the instance that made
 * it, so changes are immediate there. Other instances pick them up within
 * TTL_MS. A user's own role change is unaffected: role lives on the User
 * document, which is re-read on every request. A registry refresh failure in
 * production denies all permissions rather than restoring built-in grants.
 */

const TTL_MS = 30_000;

let cache = null; // { permissionsByRole, labelsByRole, staffRoles, isFallback, loadedAt }
let inflight = null; // dedupes concurrent loads on a cold cache

/** Deterministic matrix used only by isolated tests without a seeded DB. */
function buildFallback() {
  const permissionsByRole = Object.fromEntries(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([key, permissions]) => [
      key,
      new Set(permissions),
    ])
  );
  return finalize(permissionsByRole, { ...DEFAULT_ROLE_LABELS }, true);
}

/** Production authorization failures deny every privileged operation. */
function buildDeniedSnapshot() {
  const denied = finalize({}, {}, false);
  // Retry on the next authorization request instead of caching an outage.
  denied.loadedAt = 0;
  return denied;
}

function mayUseTestFallback() {
  return process.env.NODE_ENV === "test";
}

function finalize(permissionsByRole, labelsByRole, isFallback) {
  const staffRoles = Object.keys(permissionsByRole).filter((key) => {
    const granted = permissionsByRole[key];
    return granted.has(WILDCARD) || granted.has("admin.access");
  });
  return {
    permissionsByRole,
    labelsByRole,
    staffRoles,
    isFallback,
    loadedAt: Date.now(),
  };
}

async function loadFromDb() {
  // A disconnected mongoose would make find() hang until it reconnects.
  // Tests intentionally retain the deterministic built-in matrix; production
  // fails closed because stored grants may have been revoked or customised.
  if (mongoose.connection.readyState !== 1) {
    if (mayUseTestFallback()) return buildFallback();
    throw new Error("Role registry database is unavailable");
  }

  const roles = await Role.find({})
    .select("key label permissions")
    .lean();

  if (!roles.length) {
    if (mayUseTestFallback()) return buildFallback();
    throw new Error("Role registry is empty");
  }

  const permissionsByRole = {};
  const labelsByRole = {};
  for (const role of roles) {
    permissionsByRole[role.key] = new Set(role.permissions || []);
    labelsByRole[role.key] = role.label || role.key;
  }
  return finalize(permissionsByRole, labelsByRole, false);
}

function isFresh() {
  return cache !== null && Date.now() - cache.loadedAt < TTL_MS;
}

/**
 * Current role table, loading or refreshing it if needed. Concurrent callers on
 * a cold cache share one query.
 */
async function getSnapshot({ force = false } = {}) {
  if (!force && isFresh()) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      cache = await loadFromDb();
    } catch {
      // Authorization data is security-sensitive. Never restore built-in
      // grants after a database error because those grants may have been
      // revoked. Tests keep their isolated fallback for fixture convenience.
      cache = mayUseTestFallback() ? buildFallback() : buildDeniedSnapshot();
      cache.loadedAt = 0;
    } finally {
      inflight = null;
    }
    return cache;
  })();

  return inflight;
}

/** Drop the cache so the next read reflects a write that just happened. */
function invalidate() {
  cache = null;
  inflight = null;
}

async function permissionsForRole(roleKey) {
  const snapshot = await getSnapshot();
  const granted = snapshot.permissionsByRole[roleKey];
  return granted ? [...granted] : [];
}

/**
 * Exact match, apart from the "*" wildcard the admin role holds. Prefix
 * matching ("inventory.*") is deliberately unsupported: it would widen a role
 * by accident whenever a new permission joins an existing group.
 *
 * An unknown role grants nothing — a deleted or misspelled role fails closed.
 */
async function roleHasPermission(roleKey, permission) {
  const snapshot = await getSnapshot();
  const granted = snapshot.permissionsByRole[roleKey];
  if (!granted) return false;
  return granted.has(WILDCARD) || granted.has(permission);
}

async function isStaffRole(roleKey) {
  const snapshot = await getSnapshot();
  return snapshot.staffRoles.includes(roleKey);
}

async function staffRoles() {
  const snapshot = await getSnapshot();
  return [...snapshot.staffRoles];
}

async function allRoleKeys() {
  const snapshot = await getSnapshot();
  return Object.keys(snapshot.permissionsByRole);
}

/** Which roles hold a permission — e.g. "who can be assigned a ticket". */
async function rolesWithPermission(permission) {
  const snapshot = await getSnapshot();
  return Object.keys(snapshot.permissionsByRole).filter((key) => {
    const granted = snapshot.permissionsByRole[key];
    return granted.has(WILDCARD) || granted.has(permission);
  });
}

async function roleLabel(roleKey) {
  const snapshot = await getSnapshot();
  return snapshot.labelsByRole[roleKey] || roleKey;
}

async function roleLabels() {
  const snapshot = await getSnapshot();
  return { ...snapshot.labelsByRole };
}

async function roleExists(roleKey) {
  const snapshot = await getSnapshot();
  return Object.prototype.hasOwnProperty.call(
    snapshot.permissionsByRole,
    roleKey
  );
}

/** True while an isolated test is serving built-in defaults rather than the DB. */
async function isUsingFallback() {
  const snapshot = await getSnapshot();
  return snapshot.isFallback;
}

module.exports = {
  DEFAULT_ROLE,
  TTL_MS,
  allRoleKeys,
  getSnapshot,
  invalidate,
  isStaffRole,
  isUsingFallback,
  permissionsForRole,
  roleExists,
  roleHasPermission,
  roleLabel,
  roleLabels,
  rolesWithPermission,
  staffRoles,
};
