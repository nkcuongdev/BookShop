import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatOrderCode, formatVND } from "@/utils/format";

export function RecentOrders({ orders = [], isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!orders.length) {
    return <EmptyState title="Chưa có đơn hàng" />;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {orders.map((o) => {
        const code = formatOrderCode(o);
        return (
          <li key={o._id || o.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <Link
                to={`/admin/orders/${o._id || o.id}`}
                className="font-medium text-primary-600 hover:underline"
              >
                {code}
              </Link>
              <p className="truncate text-xs text-secondary-500">
                {o.shippingAddress?.fullName || "—"} · {o.items?.length || 0} sản phẩm
              </p>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="text-sm font-semibold text-secondary-800">
                {formatVND(o.totalAmount || 0)}
              </span>
              <StatusBadge status={o.status || "PENDING"} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
