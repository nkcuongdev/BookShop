import { StatusBadgeBase, getStatusIcon } from "@/components/ui/status-badge";
import { STATUS_META, getStatusMeta } from "@/lib/status";

const ORDER_STATUS_KEYS = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "CANCELLING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
  "REFUNDING",
  "REFUNDED",
];

/**
 * Derived from the shared table so labels and colours cannot drift from the
 * admin/profile/payment screens — `PAID` used to render green here, sky there
 * and emerald on PaymentResult.
 *
 * `icon` is resolved to a component (was a component before) and `intent`
 * replaces the old `tone` class string, which had no consumers.
 */
export const ORDER_STATUS_META = Object.fromEntries(
  ORDER_STATUS_KEYS.map((key) => {
    const meta = STATUS_META[key];
    return [key, { ...meta, icon: getStatusIcon(meta.icon) }];
  })
);

export function getOrderStatusMeta(status) {
  const key = String(status || "").toUpperCase();
  return ORDER_STATUS_META[key] || ORDER_STATUS_META.PENDING;
}

export default function OrderStatusBadge({ status, className }) {
  const known = ORDER_STATUS_META[String(status || "").toUpperCase()];
  return (
    <StatusBadgeBase
      status={known ? status : "PENDING"}
      icon
      className={className}
    />
  );
}

const PAYMENT_STATUS_KEYS = ["UNPAID", "PAID", "FAILED", "REFUNDING", "REFUNDED"];

export function PaymentStatusBadge({ status, className }) {
  const key = String(status || "UNPAID").toUpperCase();
  const resolved = PAYMENT_STATUS_KEYS.includes(key) ? key : "UNPAID";
  return (
    <StatusBadgeBase
      intent={getStatusMeta(resolved).intent}
      label={getStatusMeta(resolved).label}
      className={className}
    />
  );
}
