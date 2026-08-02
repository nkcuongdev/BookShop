import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { suppliersAPI } from "@/services/api";

export function useSuppliers(params = {}) {
  return useQuery({
    queryKey: ["admin", "suppliers", params],
    queryFn: () =>
      suppliersAPI
        .getAll(params)
        .then((r) => r.data || { suppliers: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useSupplier(id) {
  return useQuery({
    queryKey: ["admin", "suppliers", "detail", id],
    queryFn: () => suppliersAPI.getById(id).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useSupplierBooks(id, params = {}) {
  return useQuery({
    queryKey: ["admin", "suppliers", "books", id, params],
    queryFn: () => suppliersAPI.getBooks(id, params).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => suppliersAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success("Đã tạo nhà cung cấp");
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => suppliersAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success("Đã cập nhật nhà cung cấp");
    },
  });
}

export function useToggleSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => suppliersAPI.toggleStatus(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
    },
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => suppliersAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success("Đã xoá nhà cung cấp");
    },
    onError: (error) => {
      // A supplier with purchase history cannot be removed; the server explains
      // why and the toast surfaces that rather than a generic failure.
      toast.error(error?.message || "Không thể xoá nhà cung cấp");
    },
  });
}
