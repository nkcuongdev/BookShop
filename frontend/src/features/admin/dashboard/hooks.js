import { useQuery } from "@tanstack/react-query";
import { adminAPI, booksAPI } from "@/services/api";
import { revenueSeriesAPI } from "@/services/api/revenueSeries";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminAPI.getStats().then((r) => r.data),
  });
}

export function useRecentOrders(limit = 6) {
  return useQuery({
    queryKey: ["admin", "recent-orders", limit],
    queryFn: () => adminAPI.getOrders({ limit }).then((r) => r.data?.orders || []),
  });
}

export function useTopBooks(limit = 5) {
  return useQuery({
    queryKey: ["admin", "top-books", limit],
    queryFn: () =>
      booksAPI.getBestSellers(limit).then((r) => r.data?.books || []),
  });
}

export function useRevenueSeries(days = 30) {
  return useQuery({
    queryKey: ["admin", "revenue-series", days],
    queryFn: () =>
      revenueSeriesAPI.getSeries(days).then((r) => r.data?.series || []),
  });
}

export function useCategoryShare() {
  return useQuery({
    queryKey: ["admin", "category-share"],
    queryFn: () =>
      revenueSeriesAPI.getCategoryShare().then((r) => r.data?.share || []),
  });
}

export function useActivityFeed() {
  return useQuery({
    queryKey: ["admin", "activity"],
    queryFn: () =>
      revenueSeriesAPI.getActivity().then((r) => r.data?.items || []),
  });
}

export function useFunnel() {
  return useQuery({
    queryKey: ["admin", "funnel"],
    queryFn: () =>
      revenueSeriesAPI.getFunnel().then((r) => r.data?.stages || []),
  });
}
