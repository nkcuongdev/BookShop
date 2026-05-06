import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

export function PermissionGate({ action, fallback = null, children }) {
  const { user } = useAuth();
  if (!can(user, action)) return fallback;
  return children;
}
