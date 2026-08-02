// Ledger movement types, mirroring StockLedger.MOVEMENT_TYPES on the server.
export const MOVEMENT_TYPES = {
  PURCHASE_IN: { label: "Nhập hàng", tone: "success", direction: "in" },
  RETURN_IN: { label: "Khách trả", tone: "info", direction: "in" },
  CANCEL_IN: { label: "Huỷ đơn", tone: "info", direction: "in" },
  ADJUSTMENT: { label: "Điều chỉnh", tone: "warning", direction: "in" },
  COUNT: { label: "Kiểm kho", tone: "warning", direction: "both" },
  SALE_OUT: { label: "Bán hàng", tone: "default", direction: "out" },
  DAMAGE_OUT: { label: "Hư hỏng/Mất", tone: "danger", direction: "out" },
  TRANSFER_OUT: { label: "Xuất khác", tone: "default", direction: "out" },
};

export const MOVEMENT_TYPE_OPTIONS = Object.entries(MOVEMENT_TYPES).map(
  ([value, meta]) => ({ value, label: meta.label })
);

export const movementLabel = (type) => MOVEMENT_TYPES[type]?.label || type;

export const ISSUE_TYPES = [
  { value: "DAMAGED", label: "Hàng hỏng" },
  { value: "LOST", label: "Thất lạc" },
  { value: "GIFT", label: "Tặng/Khuyến mãi" },
  { value: "SAMPLE", label: "Hàng mẫu" },
  { value: "RETURN_SUPPLIER", label: "Trả nhà cung cấp" },
  { value: "OTHER", label: "Khác" },
];

export const issueTypeLabel = (value) =>
  ISSUE_TYPES.find((type) => type.value === value)?.label || value || "—";

// Document statuses resolve through the shared STATUS_META table, so these are
// just the values the filter dropdowns offer.
export const RECEIPT_STATUS_OPTIONS = ["DRAFT", "CONFIRMED", "CANCELLED"];
export const COUNT_STATUS_OPTIONS = [
  "COUNTING",
  "COMPLETED",
  "CANCELLED",
];

export const COUNT_SCOPES = [
  { value: "ALL", label: "Toàn bộ kho" },
  { value: "CATEGORY", label: "Theo danh mục" },
];

/** Severity of a low-stock row, used to colour the list. */
export function stockSeverity(book) {
  const stock = Number(book?.stock) || 0;
  if (stock <= 0) return "out";
  const threshold = Number(book?.effectiveReorderPoint) || 0;
  if (threshold > 0 && stock <= threshold / 2) return "critical";
  return "low";
}

// Maps a severity to a key in the shared STATUS_META table.
export const SEVERITY_STATUS = {
  out: "OUT_OF_STOCK",
  critical: "CRITICAL_STOCK",
  low: "LOW_STOCK",
};
