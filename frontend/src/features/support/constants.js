/**
 * Five non-overlapping problems. The specific defect for ITEM_FAULT is picked
 * separately (see ITEM_ISSUE_OPTIONS) rather than being its own category, so a
 * damaged book can no longer arrive under two different codes with two
 * different SLAs.
 */
export const SUPPORT_CATEGORIES = [
  ["NOT_RECEIVED", "Chưa nhận được hàng"],
  ["ITEM_FAULT", "Hàng bị lỗi, sai hoặc thiếu"],
  ["PAYMENT_ISSUE", "Vấn đề thanh toán / hoàn tiền"],
  ["RETURN_REQUEST", "Muốn đổi/trả hàng (không do lỗi shop)"],
  ["OTHER", "Vấn đề khác"],
];

export const SUPPORT_CATEGORY_HINTS = {
  NOT_RECEIVED: "Đơn giao chậm, thất lạc hoặc chưa tới tay bạn.",
  ITEM_FAULT:
    "Hàng hư hỏng, giao sai, thiếu hoặc không đạt chất lượng. Lỗi thuộc BookShop nên bạn được khiếu nại trong 30 ngày và BookShop chịu phí trả hàng.",
  PAYMENT_ISSUE: "Bị trừ tiền sai, trừ nhiều lần, hoặc chưa nhận được tiền hoàn.",
  RETURN_REQUEST:
    "Bạn đổi ý và muốn trả hàng còn nguyên vẹn. Áp dụng trong 7 ngày kể từ khi nhận, phí trả hàng do bạn thanh toán.",
  OTHER: "Các vấn đề không thuộc những nhóm trên.",
};

/** The concrete defect, required when the category is ITEM_FAULT. */
export const ITEM_ISSUE_OPTIONS = [
  ["DAMAGED", "Sản phẩm bị hư hỏng"],
  ["WRONG_ITEM", "Giao sai sản phẩm"],
  ["MISSING_ITEM", "Thiếu sản phẩm"],
  ["QUALITY_ISSUE", "Chất lượng không đạt"],
];

/** Categories that require the customer to identify the affected products. */
export const ITEM_PICKER_CATEGORIES = new Set(["ITEM_FAULT", "RETURN_REQUEST"]);

export const TICKET_STATUS = {
  OPEN: { label: "Mới", className: "bg-info-muted text-info-strong" },
  IN_PROGRESS: { label: "Đang xử lý", className: "bg-warning-muted text-warning-strong" },
  WAITING_CUSTOMER: { label: "Chờ khách hàng", className: "bg-secondary text-secondary-foreground" },
  RESOLVED: { label: "Đã giải quyết", className: "bg-success-muted text-success-strong" },
  CLOSED: { label: "Đã đóng", className: "bg-muted text-muted-foreground" },
};

export const TICKET_PRIORITY = {
  LOW: { label: "Thấp", className: "text-muted-foreground" },
  NORMAL: { label: "Bình thường", className: "text-info-strong" },
  HIGH: { label: "Cao", className: "text-warning-strong" },
  URGENT: { label: "Khẩn cấp", className: "text-danger-strong" },
};

export function formatSla(deadline, completed, breached, paused = false) {
  if (completed) return "Đã hoàn thành";
  // The server suspends the resolution clock while it waits on the customer.
  if (paused) return "Tạm dừng (chờ khách)";
  const remaining = new Date(deadline).getTime() - Date.now();
  const absolute = Math.abs(remaining);
  const minutes = Math.max(1, Math.ceil(absolute / 60_000));
  const value = minutes < 60 ? `${minutes} phút` : minutes < 1440 ? `${Math.ceil(minutes / 60)} giờ` : `${Math.ceil(minutes / 1440)} ngày`;
  return breached || remaining < 0 ? `Quá hạn ${value}` : `Còn ${value}`;
}
