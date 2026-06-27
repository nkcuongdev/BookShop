import { useAuth } from "@/context/AuthContext.jsx";
import { canAny } from "@/lib/rbac";
import AdminForbidden from "@/pages/admin/Forbidden.jsx";

/**
 * Route-level permission gate. Renders the forbidden page rather than
 * redirecting, so the admin shell stays put and the reason is visible.
 *
 * Pass one permission, or several when any of them is enough.
 */
export function RequirePermission({ permission, children }) {
  const { user } = useAuth();
  const permissions = Array.isArray(permission) ? permission : [permission];

  if (!canAny(user, ...permissions)) return <AdminForbidden />;
  return children;
}
