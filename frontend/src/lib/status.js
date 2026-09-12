/**
 * Single source of truth for status labels and their semantic intent.
 *
 * Data only — no Tailwind classes, no React, and deliberately NO lucide-react
 * import: `icon` is a string name that the badge resolves. This file is pulled
 * into the customer entry chunk via OrderStatusBadge, so importing 30 icons
 * here would put all of them in the initial bundle.
 *
 * Presentation lives in components/ui/status-badge.jsx.
 */

export const INTENTS = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
  "brand",
];

// Keys are stored UPPERCASE; getStatusMeta() normalizes lookups, so callers can
// pass either the backend's uppercase enums or the lowercase entity states.
export const STATUS_META = {
  // ── Order lifecycle ──
  PENDING: { label: "Chờ xử lý", intent: "warning", icon: "Clock" },
  UNPAID: { label: "Chưa thanh toán", intent: "warning", icon: "Clock" },
  PAID: { label: "Đã thanh toán", intent: "success", icon: "CreditCard" },
  PROCESSING: { label: "Đang xử lý", intent: "info", icon: "PackageCheck" },
  SHIPPED: { label: "Đang giao", intent: "info", icon: "Truck" },
  DELIVERED: { label: "Đã giao", intent: "success", icon: "CheckCircle2" },
  CANCELLING: { label: "Đang huỷ đơn", intent: "warning", icon: "RotateCcw" },
  CANCELLED: { label: "Đã huỷ", intent: "danger", icon: "XCircle" },
  FAILED: { label: "Thất bại", intent: "danger", icon: "AlertTriangle" },
  REFUNDING: { label: "Đang hoàn tiền", intent: "warning", icon: "RotateCcw" },
  // Terminal but not a good outcome — neutral, not success.
  REFUNDED: { label: "Đã hoàn tiền", intent: "neutral", icon: "Undo2" },

  // ── Payment method ──
  COD: { label: "COD", intent: "neutral" },
  VNPAY: { label: "VNPAY", intent: "info" },
  MOMO: { label: "MoMo", intent: "brand" },

  // ── Return requests ──
  APPROVED: { label: "Đã duyệt", intent: "success" },
  RETURNING: { label: "Chờ nhận hàng trả", intent: "info" },
  REJECTED: { label: "Đã từ chối", intent: "danger" },
  RECEIVED: { label: "Đang hoàn tiền", intent: "warning" },
  CLOSED: { label: "Đã hoàn tất", intent: "success" },

  // ── Entity states ──
  ACTIVE: { label: "Hoạt động", intent: "success" },
  INACTIVE: { label: "Ngưng", intent: "neutral" },
  BANNED: { label: "Đã cấm", intent: "danger" },
  DRAFT: { label: "Nháp", intent: "neutral" },
  PUBLISHED: { label: "Xuất bản", intent: "success" },
  EXPIRED: { label: "Hết hạn", intent: "danger" },
  UPCOMING: { label: "Sắp diễn ra", intent: "info" },
  USED_UP: { label: "Hết lượt", intent: "neutral" },
  ADMIN: { label: "Quản trị", intent: "brand" },
  CUSTOMER: { label: "Khách hàng", intent: "neutral" },
  LOW_STOCK: { label: "Sắp hết", intent: "warning" },
  OUT_OF_STOCK: { label: "Hết hàng", intent: "danger" },
  IN_STOCK: { label: "Còn hàng", intent: "success" },
  CRITICAL_STOCK: { label: "Rất thấp", intent: "danger" },

  // ── Warehouse documents (receipt / issue / stocktake) ──
  CONFIRMED: { label: "Đã xác nhận", intent: "success" },
  COUNTING: { label: "Đang kiểm", intent: "info" },
  COMPLETED: { label: "Hoàn tất", intent: "success" },
};

/**
 * Resolve a status of any casing to its metadata.
 * Unknown statuses fall back to a neutral chip labelled with `fallbackLabel`
 * (or the raw status), matching the previous per-map behaviour.
 */
export function getStatusMeta(status, fallbackLabel) {
  const key = String(status ?? "")
    .trim()
    .toUpperCase();
  return (
    STATUS_META[key] ?? {
      label: fallbackLabel ?? String(status ?? ""),
      intent: "neutral",
    }
  );
}
