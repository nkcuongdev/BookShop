import {
  Clock,
  CreditCard,
  PackageCheck,
  Truck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Map trạng thái đơn hàng (matches backend ORDER_STATUS)
export const ORDER_STATUS_META = {
  PENDING: {
    label: "Chờ thanh toán",
    icon: Clock,
    variant: "warning",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
  PAID: {
    label: "Đã thanh toán",
    icon: CreditCard,
    variant: "info",
    tone: "bg-sky-50 text-sky-700 border-sky-200",
  },
  PROCESSING: {
    label: "Đang xử lý",
    icon: PackageCheck,
    variant: "info",
    tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  SHIPPED: {
    label: "Đang giao",
    icon: Truck,
    variant: "info",
    tone: "bg-blue-50 text-blue-700 border-blue-200",
  },
  DELIVERED: {
    label: "Đã giao",
    icon: CheckCircle2,
    variant: "success",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "Đã hủy",
    icon: XCircle,
    variant: "destructive",
    tone: "bg-red-50 text-red-700 border-red-200",
  },
  FAILED: {
    label: "Thanh toán thất bại",
    icon: AlertTriangle,
    variant: "destructive",
    tone: "bg-red-50 text-red-700 border-red-200",
  },
  REFUNDING: {
    label: "Đang hoàn tiền",
    icon: RotateCcw,
    variant: "warning",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
  REFUNDED: {
    label: "Đã hoàn tiền",
    icon: Undo2,
    variant: "secondary",
    tone: "bg-gray-100 text-gray-700 border-gray-200",
  },
};

export function getOrderStatusMeta(status) {
  const key = String(status || "").toUpperCase();
  return ORDER_STATUS_META[key] || ORDER_STATUS_META.PENDING;
}

export default function OrderStatusBadge({ status, className }) {
  const meta = getOrderStatusMeta(status);
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className}>
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </Badge>
  );
}

const PAYMENT_STATUS_META = {
  UNPAID: { label: "Chưa thanh toán", variant: "warning" },
  PAID: { label: "Đã thanh toán", variant: "success" },
  FAILED: { label: "Thất bại", variant: "destructive" },
  REFUNDING: { label: "Đang hoàn tiền", variant: "warning" },
  REFUNDED: { label: "Đã hoàn tiền", variant: "secondary" },
};

export function PaymentStatusBadge({ status, className }) {
  const key = String(status || "UNPAID").toUpperCase();
  const meta = PAYMENT_STATUS_META[key] || PAYMENT_STATUS_META.UNPAID;
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  );
}
