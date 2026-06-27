const AuditLog = require("../models/AuditLog");

/**
 * Display vocabulary for the audit trail.
 *
 * Kept apart from auditLogService so the write path stays free of presentation
 * concerns, and so the route and the CSV exporter render an entry identically.
 */

const { ACTIONS, CATEGORIES } = AuditLog;

const ACTION_LABELS = Object.freeze({
  [ACTIONS.BOOK_PRICE_UPDATE]: "Sửa giá sách",
  [ACTIONS.BOOK_STOCK_ADJUST]: "Điều chỉnh tồn kho",
  [ACTIONS.ORDER_STATUS_CHANGE]: "Đổi trạng thái đơn",
  [ACTIONS.REFUND_APPROVE]: "Duyệt hoàn tiền / đổi trả",
  [ACTIONS.REFUND_REJECT]: "Từ chối hoàn tiền / đổi trả",
  [ACTIONS.USER_STATUS_CHANGE]: "Khoá / mở tài khoản",
  [ACTIONS.USER_ROLE_CHANGE]: "Đổi vai trò tài khoản",
  [ACTIONS.LOYALTY_POINTS_ADJUST]: "Điều chỉnh điểm thưởng",
  [ACTIONS.LOYALTY_PROGRAM_UPDATE]: "Sửa chương trình điểm thưởng",
  [ACTIONS.LOYALTY_GIFT_UPDATE]: "Sửa quà đổi điểm",
});

const CATEGORY_LABELS = Object.freeze({
  [CATEGORIES.CATALOG]: "Sách",
  [CATEGORIES.INVENTORY]: "Tồn kho",
  [CATEGORIES.ORDER]: "Đơn hàng",
  [CATEGORIES.REFUND]: "Hoàn tiền",
  [CATEGORIES.ACCOUNT]: "Tài khoản",
  [CATEGORIES.LOYALTY]: "Điểm thưởng",
});

/** Field labels shared by the writers, so one field reads the same everywhere. */
const FIELD_LABELS = Object.freeze({
  price: "Giá bán",
  originalPrice: "Giá gốc",
  costPrice: "Giá vốn",
  stock: "Tồn kho",
  status: "Trạng thái",
  role: "Vai trò",
  refundStatus: "Trạng thái hoàn tiền",
  refundAmount: "Số tiền hoàn",
  pointsBalance: "Số dư điểm",
  earnRate: "Tỉ lệ tích điểm",
  redeemRate: "Tỉ lệ quy đổi điểm",
  redeemMaxPercent: "Trần dùng điểm (%)",
  pointsCost: "Điểm cần đổi",
});

const EMPTY = "(trống)";

/**
 * One-line summary of what an entry changed: "Giá bán: 100.000 → 120.000".
 * Entries with no field diff (approving a refund) fall back to their reason,
 * so the list never shows a blank cell.
 */
function describeChanges(entry) {
  const changes = entry?.changes || [];
  if (!changes.length) return entry?.reason || "";
  return changes
    .map(
      (change) =>
        `${change.label || change.field}: ${change.before || EMPTY} → ${
          change.after || EMPTY
        }`
    )
    .join("; ");
}

module.exports = {
  ACTION_LABELS,
  CATEGORY_LABELS,
  FIELD_LABELS,
  describeChanges,
};
