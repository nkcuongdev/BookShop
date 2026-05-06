import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { vouchersAPI } from "@/services/api";

export function useVouchers(params = {}) {
  return useQuery({
    queryKey: ["admin", "vouchers", params],
    queryFn: () =>
      vouchersAPI.getAll(params).then((r) => r.data?.vouchers || []),
  });
}

export function useCreateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => vouchersAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "vouchers"] });
      toast.success("Đã tạo voucher");
    },
  });
}

export function useUpdateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => vouchersAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "vouchers"] });
      toast.success("Đã cập nhật voucher");
    },
  });
}

export function useDeleteVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => vouchersAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "vouchers"] });
      toast.success("Đã xoá voucher");
    },
  });
}

export function useToggleVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => vouchersAPI.toggleActive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "vouchers"] });
    },
  });
}
