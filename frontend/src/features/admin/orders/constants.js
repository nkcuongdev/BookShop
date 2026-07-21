// Đồng bộ với enum ORDER_STATUS ở backend/src/models/Order.js
export const ORDER_STATUSES = [
  { value: "PENDING", label: "Chờ xử lý" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "PROCESSING", label: "Đang xử lý" },
  { value: "CANCELLING", label: "Đang huỷ đơn" },
  { value: "SHIPPED", label: "Đang giao" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "CANCELLED", label: "Đã huỷ" },
  { value: "FAILED", label: "Thất bại" },
  { value: "REFUNDING", label: "Đang hoàn tiền" },
  { value: "REFUNDED", label: "Đã hoàn tiền" },
];

// Các action admin có thể thực hiện ứng với từng trạng thái hiện tại của đơn.
// Mỗi action gắn với endpoint admin tương ứng trong services/api/admin.js.
// `permission` phải khớp với gate của route ở backend/src/routes/admin.js:
// CSKH xử lý khách (order.support), kho xử lý giao vận (order.fulfill).
export const ADMIN_ORDER_ACTIONS = {
  PENDING: [
    {
      action: "confirm",
      label: "Duyệt đơn (COD)",
      next: "PROCESSING",
      paymentMethods: ["COD"],
      permission: "order.support",
    },
    {
      action: "cancel",
      label: "Từ chối / Huỷ đơn",
      next: "CANCELLED",
      variant: "destructive",
      permission: "order.support",
    },
  ],
  PAID: [
    // Sau khi thanh toán online thành công, đơn tự vào PAID.
    // Admin duyệt để chuyển sang xử lý giao hàng.
    {
      action: "processing",
      label: "Duyệt đơn online",
      next: "PROCESSING",
      permission: "order.support",
    },
    // Backend cho phép huỷ ở PENDING/PAID/PROCESSING, không phân biệt phương
    // thức thanh toán. Đơn đã trả tiền sẽ đi qua CANCELLING rồi hoàn tiền bất
    // đồng bộ, nên nhãn nói rõ điều đó thay vì hứa huỷ xong ngay.
    {
      action: "cancel",
      label: "Từ chối / Huỷ đơn",
      next: "CANCELLING",
      variant: "destructive",
      permission: "order.support",
    },
  ],
  PROCESSING: [
    {
      action: "ship",
      label: "Bàn giao vận chuyển",
      next: "SHIPPED",
      permission: "order.fulfill",
    },
    {
      action: "cancel",
      label: "Huỷ đơn",
      next: "CANCELLING",
      variant: "destructive",
      permission: "order.support",
    },
  ],
  CANCELLING: [],
  SHIPPED: [
    {
      action: "deliver",
      label: "Xác nhận đã giao",
      next: "DELIVERED",
      permission: "order.fulfill",
    },
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
