import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { promotionsAPI } from "@/services/api";

const KEY = ["admin", "promotions"];

export function usePromotions(params = {}) {
  return useQuery({
    queryKey: [...KEY, params],
    queryFn: () =>
      promotionsAPI.getAll(params).then((r) => r.data?.promotions || []),
  });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => promotionsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["books"] });
      toast.success("Đã tạo khuyến mãi");
    },
    onError: (e) => toast.error(e.message || "Không thể tạo khuyến mãi"),
  });
}

export function useUpdatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => promotionsAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["books"] });
      toast.success("Đã cập nhật khuyến mãi");
    },
    onError: (e) => toast.error(e.message || "Không thể cập nhật"),
  });
}

export function useDeletePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => promotionsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["books"] });
      toast.success("Đã xoá khuyến mãi");
    },
  });
}

export function useTogglePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => promotionsAPI.toggleActive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["books"] });
    },
  });
}

export function usePromotionBooks(params) {
  return useQuery({
    queryKey: ["admin", "promotions", "books", params],
    queryFn: () =>
      promotionsAPI.searchBooks(params).then((r) => r.data?.books || []),
    keepPreviousData: true,
  });
}
