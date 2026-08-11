import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Gift,
  Settings2,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";
import { formatDateTimeVN, formatOrderCode } from "@/utils/format";
import { pointEntryLabel } from "@/utils/loyalty";

const FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "EARN", label: "Tích điểm" },
  { value: "REDEEM_ORDER", label: "Dùng cho đơn" },
  { value: "REDEEM_GIFT", label: "Đổi quà" },
  { value: "ADJUST", label: "Điều chỉnh" },
];

// Icon and colour per movement type. Anything unlisted still renders, with the
// neutral treatment, so a new ledger type does not break this screen.
const ENTRY_STYLE = {
  EARN: { icon: ArrowUpRight, className: "bg-success-muted text-success-strong" },
  REFUND_ORDER: { icon: Undo2, className: "bg-success-muted text-success-strong" },
  REDEEM_ORDER: { icon: ArrowDownRight, className: "bg-danger-muted text-danger-strong" },
  REDEEM_GIFT: { icon: Gift, className: "bg-danger-muted text-danger-strong" },
  REVOKE: { icon: Undo2, className: "bg-danger-muted text-danger-strong" },
  EXPIRE: { icon: Clock, className: "bg-muted text-muted-foreground" },
  ADJUST: { icon: Settings2, className: "bg-info-muted text-info-strong" },
};

function EntryRow({ entry }) {
  const style = ENTRY_STYLE[entry.type] || {
    icon: Sparkles,
    className: "bg-muted text-muted-foreground",
  };
  const Icon = style.icon;
  const positive = entry.points > 0;
  const orderId = entry.refType === "Order" ? entry.refId : null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-4">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          style.className
        )}
      >
        <Icon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {entry.reason || pointEntryLabel(entry.type)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDateTimeVN(entry.createdAt)}
          {orderId && (
            <>
              {" · "}
              <Link
                to={`/profile/orders/${orderId}`}
                className="text-primary hover:underline"
              >
                {formatOrderCode({ orderCode: entry.refCode })}
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            "text-sm font-semibold tabular-nums",
            positive ? "text-success-strong" : "text-danger-strong"
          )}
        >
          {positive ? "+" : "−"}
          {Math.abs(entry.points).toLocaleString("vi-VN")}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Số dư: {entry.balanceAfter.toLocaleString("vi-VN")}
        </div>
      </div>
    </div>
  );
}

export default function PointsHistoryList({
  entries = [],
  isLoading = false,
  type = "",
  onTypeChange,
  footer = null,
}) {
  return (
    <Card className="p-6">
      <h2 className="text-h3 font-semibold">Lịch sử điểm</h2>

      <Tabs value={type} onValueChange={onTypeChange} className="mt-4">
        <TabsList className="flex-wrap">
          {FILTERS.map((filter) => (
            <TabsTrigger key={filter.value || "all"} value={filter.value}>
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[74px] rounded-xl" />
          ))
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Chưa có biến động điểm"
            description="Điểm thưởng sẽ xuất hiện ở đây sau khi đơn hàng của bạn được giao thành công."
          />
        ) : (
          entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>

      {footer}
    </Card>
  );
}
