import {
  ClipboardList,
  CreditCard,
  PackageCheck,
  Truck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeVN } from "@/utils/format.js";

const HAPPY_PATH = [
  {
    key: "placed",
    label: "Đã đặt hàng",
    icon: ClipboardList,
    dateField: "placedAt",
    fallbackField: "createdAt",
  },
  {
    key: "paid",
    label: "Đã thanh toán",
    icon: CreditCard,
    dateField: "paidAt",
    matchStatuses: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"],
  },
  {
    key: "processing",
    label: "Đang xử lý",
    icon: PackageCheck,
    dateField: "processingAt",
    matchStatuses: ["PROCESSING", "SHIPPED", "DELIVERED"],
  },
  {
    key: "shipped",
    label: "Đang giao",
    icon: Truck,
    dateField: "shippedAt",
    matchStatuses: ["SHIPPED", "DELIVERED"],
  },
  {
    key: "delivered",
    label: "Đã giao",
    icon: CheckCircle2,
    dateField: "deliveredAt",
    matchStatuses: ["DELIVERED"],
  },
];

function isStepDone(order, step) {
  if (order[step.dateField]) return true;
  if (step.matchStatuses?.includes(order.status)) return true;
  return false;
}

function getHistoryDate(order, status) {
  const found = (order.history || []).find((h) => h.to === status);
  return found?.at;
}

function buildSteps(order) {
  const isCOD = order.payment?.method === "COD";
  const status = order.status;

  // Terminal "negative" branches
  if (status === "CANCELLING") {
    return [
      {
        key: "placed",
        label: "Đã đặt hàng",
        icon: ClipboardList,
        date: order.placedAt || order.createdAt,
        state: "done",
      },
      {
        key: "cancelling",
        label: "Đang hủy vận đơn và đơn hàng",
        icon: RotateCcw,
        date: getHistoryDate(order, "CANCELLING"),
        state: "active",
      },
    ];
  }

  if (status === "CANCELLED") {
    return [
      {
        key: "placed",
        label: "Đã đặt hàng",
        icon: ClipboardList,
        date: order.placedAt || order.createdAt,
        state: "done",
      },
      {
        key: "cancelled",
        label: "Đã hủy",
        icon: XCircle,
        date: order.cancelledAt || getHistoryDate(order, "CANCELLED"),
        state: "danger",
      },
    ];
  }

  if (status === "FAILED") {
    return [
      {
        key: "placed",
        label: "Đã đặt hàng",
        icon: ClipboardList,
        date: order.placedAt || order.createdAt,
        state: "done",
      },
      {
        key: "failed",
        label: "Thanh toán thất bại",
        icon: XCircle,
        date: getHistoryDate(order, "FAILED"),
        state: "danger",
      },
    ];
  }

  if (status === "REFUNDING" || status === "REFUNDED") {
    const base = [
      {
        key: "placed",
        label: "Đã đặt hàng",
        icon: ClipboardList,
        date: order.placedAt || order.createdAt,
        state: "done",
      },
      {
        key: "paid",
        label: "Đã thanh toán",
        icon: CreditCard,
        date: order.paidAt,
        state: "done",
      },
      {
        key: "refunding",
        label: "Đang hoàn tiền",
        icon: RotateCcw,
        date: getHistoryDate(order, "REFUNDING"),
        state: status === "REFUNDING" ? "active" : "done",
      },
    ];
    if (status === "REFUNDED") {
      base.push({
        key: "refunded",
        label: "Đã hoàn tiền",
        icon: Undo2,
        date: order.refundedAt,
        state: "done",
      });
    }
    return base;
  }

  // Happy path - COD không có bước "Đã thanh toán" riêng (paid khi delivered)
  return HAPPY_PATH.filter((s) => !(isCOD && s.key === "paid")).map((step) => {
    const done = isStepDone(order, step);
    const date = order[step.dateField] || order[step.fallbackField];
    // step "active" là bước hiện tại (trạng thái khớp)
    const statusKey = step.key.toUpperCase();
    const isActive =
      !done &&
      (status === statusKey ||
        (step.key === "placed" && status === "PENDING"));
    return {
      ...step,
      date: done ? date : null,
      state: done ? "done" : isActive ? "active" : "pending",
    };
  });
}

export default function OrderTimeline({ order }) {
  const steps = buildSteps(order);

  return (
    <ol className="relative">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isLast = idx === steps.length - 1;
        const isDone = step.state === "done";
        const isActive = step.state === "active";
        const isDanger = step.state === "danger";

        return (
          <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-8 bottom-0 w-0.5",
                  isDone || isDanger ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <div
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
                isDanger
                  ? "bg-danger-strong text-white"
                  : isDone
                  ? "bg-primary text-primary-foreground"
                  : isActive
                  ? "bg-warning-strong text-white animate-pulse"
                  : "bg-border text-muted-foreground"
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="flex-1 pt-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isDanger
                    ? "text-danger-strong"
                    : isDone || isActive
                    ? "text-foreground"
                    : "text-muted-foreground/70"
                )}
              >
                {step.label}
              </p>
              {step.date ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTimeVN(step.date)}
                </p>
              ) : isActive ? (
                <p className="text-xs text-warning-strong mt-0.5 font-medium">
                  Đang xử lý...
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
