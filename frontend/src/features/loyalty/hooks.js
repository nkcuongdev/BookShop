import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loyaltyAPI } from "@/services/api";

// Points show up on the profile, the overview, the header and the checkout
// summary at once. React Query is what keeps those five views agreeing after a
// redemption, rather than each holding its own stale copy.
const KEY = ["loyalty"];

export function useMyLoyalty(options = {}) {
  return useQuery({
    queryKey: [...KEY, "me"],
    queryFn: () => loyaltyAPI.getMe().then((r) => r.data),
    ...options,
  });
}

export function useMyPointsHistory(params = {}) {
  return useQuery({
    queryKey: [...KEY, "history", params],
    queryFn: () =>
      loyaltyAPI
        .getHistory(params)
        .then((r) => r.data || { entries: [], pagination: null }),
    // Keeps the previous page on screen while the next one loads, so switching
    // filters does not flash an empty list.
    placeholderData: (previous) => previous,
  });
}

export function useRewards(params = {}) {
  return useQuery({
    queryKey: [...KEY, "gifts", params],
    queryFn: () =>
      loyaltyAPI
        .getGifts(params)
        .then((r) => r.data || { gifts: [], pagination: null, balance: 0 }),
    placeholderData: (previous) => previous,
  });
}

export function useMyRedemptions(params = {}) {
  return useQuery({
    queryKey: [...KEY, "my-gifts", params],
    queryFn: () =>
      loyaltyAPI
        .getMyGifts(params)
        .then((r) => r.data || { redemptions: [], pagination: null }),
    placeholderData: (previous) => previous,
  });
}

export function useRedeemReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (giftId) => loyaltyAPI.redeemGift(giftId),
    onSuccess: () => {
      // Invalidate the whole branch: the balance, the history and the
      // catalogue's affordability flags all moved at once.
      qc.invalidateQueries({ queryKey: KEY });
    },
    // Errors are surfaced by the global mutation handler in lib/queryClient.
  });
}

/**
 * Balance and programme rules for the checkout summary.
 *
 * `enabled` is what keeps the cart page from fetching this at all: the summary
 * card is shared between cart and checkout, and only checkout offers points.
 */
export function usePointsCheckoutContext({ enabled = true } = {}) {
  return useQuery({
    queryKey: [...KEY, "me"],
    queryFn: () => loyaltyAPI.getMe().then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

export function useRecalcTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId) => loyaltyAPI.recalcTier(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Đã xét lại hạng thành viên");
    },
  });
}
