/**
 * UI-side permission checks.
 *
 * The permission list comes from the API (`user.permissions`, served by
 * /api/auth/me), so there is no copy of the role table here to drift out of
 * sync with the backend. These checks only decide what to render — the API
 * enforces the same grants on every request, so a hidden button is a
 * convenience, never the security boundary.
 */

const WILDCARD = "*";

const grantsOf = (user) => (Array.isArray(user?.permissions) ? user.permissions : null);

export function can(user, permission) {
  const granted = grantsOf(user);
  if (!granted) return false;
  return granted.includes(WILDCARD) || granted.includes(permission);
}

export function canAny(user, ...permissions) {
  const granted = grantsOf(user);
  if (!granted) return false;
  if (granted.includes(WILDCARD)) return true;
  return permissions.some((permission) => granted.includes(permission));
}

/** True for shop staff of any kind, false for customers and signed-out visitors. */
export function isStaff(user) {
  return can(user, "admin.access");
}

/** Human-readable name of the user's role, as resolved by the server. */
export function roleLabel(user) {
  if (!user) return "";
  return user.roleLabel || user.role || "";
}
