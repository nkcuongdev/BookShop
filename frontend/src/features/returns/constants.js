import { statusBadgeVariants } from "@/components/ui/status-badge";
import { getStatusMeta } from "@/lib/status";

export const RETURN_REASON_OPTIONS = [
  { value: "DAMAGED", label: "Sản phẩm bị hư hỏng" },
  { value: "WRONG_ITEM", label: "Giao sai sản phẩm" },
  { value: "MISSING_ITEM", label: "Thiếu sản phẩm" },
  { value: "QUALITY_ISSUE", label: "Chất lượng không đạt" },
  { value: "OTHER", label: "Lý do khác" },
];

export const RETURN_REASON_LABELS = Object.fromEntries(
  RETURN_REASON_OPTIONS.map((option) => [option.value, option.label])
);

const RETURN_STATUS_KEYS = [
  "PENDING",
  "APPROVED",
  "RETURNING",
  "REJECTED",
  "RECEIVED",
  "CLOSED",
];

/**
 * Shape kept as `{ label, className }` so ReturnRequestStatusBadge needs no
 * change, but both fields now derive from the shared status table + CVA rather
 * than hand-written `bg-X-100 text-X-800 ring-X-200` triplets.
 *
 * Note "Chờ duyệt" — the return-request PENDING label differs from the order
 * PENDING label, so it is overridden here rather than pulled from STATUS_META.
 */
export const RETURN_STATUS_META = Object.fromEntries(
  RETURN_STATUS_KEYS.map((key) => {
    const meta = getStatusMeta(key);
    return [
      key,
      {
        label: key === "PENDING" ? "Chờ duyệt" : meta.label,
        intent: meta.intent,
        className: statusBadgeVariants({ intent: meta.intent }),
      },
    ];
  })
);
