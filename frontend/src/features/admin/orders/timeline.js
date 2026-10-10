// COD đơn không qua PAID trước khi giao: tiền chỉ được ghi nhận khi DELIVERED.
const ONLINE_FLOW = ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
const COD_FLOW = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"];
const EXCEPTION_STATUSES = new Set([
  "CANCELLING",
  "CANCELLED",
  "FAILED",
  "REFUNDING",
  "REFUNDED",
]);

// Dựng các bước từ history thực tế của đơn thay vì giả định mọi bước trước
// trạng thái hiện tại đều đã qua. Đơn huỷ/thất bại/hoàn tiền hiển thị nhánh
// thực tế đã đi (ví dụ PENDING → Đã huỷ). Dữ liệu cũ không có history thì
// quay về tiến trình theo phương thức thanh toán.
export function buildOrderTimeline(order, current) {
  const flow = order.payment?.method === "COD" ? COD_FLOW : ONLINE_FLOW;
  const visited = [];
  for (const entry of order.history || []) {
    for (const status of [entry.from, entry.to]) {
      if (status && !visited.includes(status)) visited.push(status);
    }
  }
  if (!visited.includes(current)) visited.push(current);

  if (!EXCEPTION_STATUSES.has(current)) {
    const idx = flow.indexOf(current);
    return flow.map((s, i) => ({
      status: s,
      reached: visited.includes(s) || i <= idx,
      exception: false,
    }));
  }
  return visited
    .filter((s) => flow.includes(s) || EXCEPTION_STATUSES.has(s))
    .map((s) => ({ status: s, reached: true, exception: EXCEPTION_STATUSES.has(s) }));
}
