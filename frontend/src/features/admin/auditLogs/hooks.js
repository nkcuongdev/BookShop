import { useQuery } from "@tanstack/react-query";
import { auditLogsAPI } from "@/services/api";

const AUDIT_KEY = ["admin", "audit-logs"];

export function useAuditLogs(params = {}) {
  return useQuery({
    queryKey: [...AUDIT_KEY, "list", params],
    queryFn: () =>
      auditLogsAPI
        .getAll(params)
        .then((r) => r.data || { items: [], pagination: null }),
    // Keeps the table on screen while a filter change refetches, instead of
    // collapsing to a spinner on every keystroke.
    placeholderData: (previous) => previous,
  });
}

/**
 * Filter vocabulary. The actor list only grows when someone performs an
 * auditable action, so it is safe to hold for a while.
 */
export function useAuditLogMeta() {
  return useQuery({
    queryKey: [...AUDIT_KEY, "meta"],
    queryFn: () =>
      auditLogsAPI
        .getMeta()
        .then((r) => r.data || { actors: [], actions: [], categories: [] }),
    staleTime: 5 * 60 * 1000,
  });
}
