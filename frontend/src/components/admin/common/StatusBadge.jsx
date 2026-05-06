import { cn } from "@/lib/utils";

const MAP = {
  // ── Order status (backend uppercase) ──
  PENDING: { label: "Chờ xử lý", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  PAID: { label: "Đã thanh toán", cls: "bg-green-100 text-green-800 ring-green-200" },
  PROCESSING: { label: "Đang xử lý", cls: "bg-blue-100 text-blue-800 ring-blue-200" },
  SHIPPED: { label: "Đang giao", cls: "bg-cyan-100 text-cyan-800 ring-cyan-200" },
  DELIVERED: { label: "Đã giao", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  CANCELLED: { label: "Đã huỷ", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  FAILED: { label: "Thất bại", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  REFUNDING: { label: "Đang hoàn tiền", cls: "bg-orange-100 text-orange-800 ring-orange-200" },
  REFUNDED: { label: "Đã hoàn tiền", cls: "bg-slate-100 text-slate-700 ring-slate-200" },

  // ── Payment status ──
  UNPAID: { label: "Chưa thanh toán", cls: "bg-amber-100 text-amber-800 ring-amber-200" },

  // ── Payment method ──
  COD: { label: "COD", cls: "bg-gray-100 text-gray-700 ring-gray-200" },
  VNPAY: { label: "VNPAY", cls: "bg-sky-100 text-sky-800 ring-sky-200" },
  ZALOPAY: { label: "ZaloPay", cls: "bg-blue-100 text-blue-800 ring-blue-200" },
  STRIPE: { label: "Stripe", cls: "bg-indigo-100 text-indigo-800 ring-indigo-200" },

  // ── Others (giữ cũ) ──
  active: { label: "Hoạt động", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  inactive: { label: "Ngưng", cls: "bg-gray-100 text-gray-700 ring-gray-200" },
  banned: { label: "Đã cấm", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  draft: { label: "Nháp", cls: "bg-gray-100 text-gray-700 ring-gray-200" },
  published: { label: "Xuất bản", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  expired: { label: "Hết hạn", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  upcoming: { label: "Sắp diễn ra", cls: "bg-sky-100 text-sky-800 ring-sky-200" },
  used_up: { label: "Hết lượt", cls: "bg-gray-100 text-gray-700 ring-gray-200" },
  admin: { label: "Quản trị", cls: "bg-primary-100 text-primary-700 ring-primary-200" },
  customer: { label: "Khách hàng", cls: "bg-gray-100 text-gray-700 ring-gray-200" },
  low_stock: { label: "Sắp hết", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  out_of_stock: { label: "Hết hàng", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  in_stock: { label: "Còn hàng", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
};

export function StatusBadge({ status, label, className }) {
  const key = status == null ? "" : String(status);
  const cfg =
    MAP[key] ||
    MAP[key.toUpperCase?.()] ||
    MAP[key.toLowerCase?.()] ||
    { label: label || key, cls: "bg-gray-100 text-gray-700 ring-gray-200" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        cfg.cls,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label || cfg.label}
    </span>
  );
}
