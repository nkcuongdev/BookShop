import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loyaltyAPI } from "@/services/api";

const KEY = ["admin", "loyalty"];

export function useLoyaltyProgram() {
  return useQuery({
    queryKey: [...KEY, "program"],
    queryFn: () => loyaltyAPI.getProgram().then((r) => r.data?.program),
  });
}

export function useUpdateLoyaltyProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => loyaltyAPI.updateProgram(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // The customer-facing cache holds the same rules, so it goes too.
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      toast.success("Đã lưu cấu hình chương trình");
    },
  });
}

export function useLoyaltyMembers(params = {}) {
  return useQuery({
    queryKey: [...KEY, "members", params],
    queryFn: () =>
      loyaltyAPI
        .getMembers(params)
        .then((r) => r.data || { members: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useLoyaltyMember(userId, params = {}) {
  return useQuery({
    queryKey: [...KEY, "members", userId, params],
    queryFn: () => loyaltyAPI.getMemberDetail(userId, params).then((r) => r.data),
    enabled: Boolean(userId),
    placeholderData: (previous) => previous,
  });
}

export function useAdjustPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }) => loyaltyAPI.adjustPoints(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Đã điều chỉnh điểm");
    },
  });
}

export function useRecalcMemberTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId) => loyaltyAPI.recalcTier(userId),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: KEY });
      const data = response?.data;
      toast.success(
        data?.changed
          ? `Đã chuyển sang hạng ${data.to}`
          : "Hạng hiện tại vẫn phù hợp"
      );
    },
  });
}

export function useAdminGifts(params = {}) {
  return useQuery({
    queryKey: [...KEY, "gifts", params],
    queryFn: () =>
      loyaltyAPI
        .getAdminGifts(params)
        .then((r) => r.data || { gifts: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useCreateGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => loyaltyAPI.createGift(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Đã tạo quà");
    },
  });
}

export function useUpdateGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => loyaltyAPI.updateGift(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Đã lưu quà");
    },
  });
}

export function useDeleteGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => loyaltyAPI.deleteGift(id),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: KEY });
      // A gift somebody already redeemed is deactivated rather than deleted,
      // and the message has to say which happened.
      toast.success(response?.message || "Đã xoá quà");
    },
  });
}

export function useLoyaltyStats() {
  return useQuery({
    queryKey: [...KEY, "stats"],
    queryFn: () => loyaltyAPI.getStats().then((r) => r.data),
  });
}
