import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

/**
 * Renders children only when the signed-in user holds `permission`. The API
 * enforces the same check, so this is about not showing dead controls.
 */
export function PermissionGate({ permission, fallback = null, children }) {
  const { user } = useAuth();
  if (!can(user, permission)) return fallback;
  return children;
}
