import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usersAPI } from "@/services/api";

export function useUsers(params = {}) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => usersAPI.getAll(params).then((r) => r.data?.users || []),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }) => usersAPI.updateRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Đã cập nhật vai trò");
    },
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => usersAPI.setStatus(id, status),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(vars.status === "banned" ? "Đã cấm người dùng" : "Đã khôi phục");
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => usersAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Đã xoá người dùng");
    },
  });
}
