import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rolesAPI } from "@/services/api";
import { useAuth } from "@/context/AuthContext.jsx";

const ROLES_KEY = ["admin", "roles"];

/**
 * Editing a role changes what its holders may do, so the current user's own
 * session data can be stale afterwards — refresh it alongside the role list.
 */
function useInvalidateRoles() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  return async () => {
    qc.invalidateQueries({ queryKey: ROLES_KEY });
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    await refreshUser?.();
  };
}

export function useRoles({ enabled = true } = {}) {
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: () => rolesAPI.getAll().then((r) => r.data?.roles || []),
    enabled,
  });
}

export function useRole(key) {
  const rolesQ = useRoles();
  return {
    ...rolesQ,
    data: rolesQ.data?.find((role) => role.key === key),
  };
}

export function usePermissionCatalog({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...ROLES_KEY, "catalog"],
    queryFn: () =>
      rolesAPI.getPermissionCatalog().then((r) => ({
        groups: r.data?.groups || [],
        adminOnly: r.data?.adminOnly || [],
      })),
    // The catalogue only changes with a deploy.
    staleTime: 60 * 60_000,
    enabled,
  });
}

/** The signed-in user's own permissions — used by the profile page. */
export function useMyPermissions() {
  return useQuery({
    queryKey: ["me", "permissions"],
    queryFn: () => rolesAPI.getMine().then((r) => r.data),
  });
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (data) => rolesAPI.create(data),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã tạo vai trò");
    },
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ key, data }) => rolesAPI.update(key, data),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã lưu vai trò");
    },
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (key) => rolesAPI.delete(key),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã xoá vai trò");
    },
  });
}
