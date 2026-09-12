import { StatusBadgeBase } from "@/components/ui/status-badge";

/**
 * Admin status chip. Labels and colours come from the shared table in
 * lib/status.js — see components/ui/status-badge.jsx for the intent palette.
 * Keeps the leading dot, the case-insensitive lookup, and the `label` override
 * that the previous local MAP provided.
 */
export function StatusBadge({ status, label, className }) {
  return (
    <StatusBadgeBase status={status} label={label} dot className={className} />
  );
}
