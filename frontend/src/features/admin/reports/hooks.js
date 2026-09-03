import { useQuery } from "@tanstack/react-query";
import { reportsAPI } from "@/services/api";

const REPORTS_KEY = ["admin", "reports"];

export function useProfitReport(params = {}) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "profit", params],
    queryFn: () => reportsAPI.getProfit(params).then((r) => r.data),
    // Keep the previous period on screen while a new range loads, so changing
    // the filter does not blank the whole page.
    placeholderData: (previous) => previous,
  });
}
