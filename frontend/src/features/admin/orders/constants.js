// Đồng bộ với enum ORDER_STATUS ở backend/src/models/Order.js
export const ORDER_STATUSES = [
  { value: "PENDING", label: "Chờ xử lý" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "PROCESSING", label: "Đang xử lý" },
  { value: "SHIPPED", label: "Đang giao" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "CANCELLED", label: "Đã huỷ" },
  { value: "FAILED", label: "Thất bại" },
  { value: "REFUNDING", label: "Đang hoàn tiền" },
  { value: "REFUNDED", label: "Đã hoàn tiền" },
];

// Các action admin có thể thực hiện ứng với từng trạng thái hiện tại của đơn.
// Mỗi action gắn với endpoint admin tương ứng trong services/api/admin.js
export const ADMIN_ORDER_ACTIONS = {
  PENDING: [
    { action: "confirm", label: "Duyệt đơn (COD)", next: "PROCESSING" },
  ],
  PAID: [
    // Sau khi thanh toán online thành công, đơn tự vào PAID.
    // Admin duyệt để chuyển sang xử lý giao hàng.
    { action: "processing", label: "Duyệt đơn online", next: "PROCESSING" },
  ],
  PROCESSING: [
    { action: "ship", label: "Bàn giao vận chuyển", next: "SHIPPED" },
  ],
  SHIPPED: [
    { action: "deliver", label: "Xác nhận đã giao", next: "DELIVERED" },
  ],
  DELIVERED: [],
  CANCELLED: [],
  FAILED: [],
  REFUNDING: [],
  REFUNDED: [],
};

export const PAYMENT_METHOD_LABEL = {
  COD: "COD",
  VNPAY: "VNPAY",
  MOMO: "MoMo",
};

export const PAYMENT_STATUS_LABEL = {
  UNPAID: "Chưa thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Thất bại",
  REFUNDING: "Đang hoàn tiền",
  REFUNDED: "Đã hoàn tiền",
};
