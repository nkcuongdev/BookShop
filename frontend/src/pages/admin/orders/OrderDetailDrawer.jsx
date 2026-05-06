import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, MapPin, Package, Phone, User } from "lucide-react";
import {
  ADMIN_ORDER_ACTIONS,
  ORDER_STATUSES,
} from "@/features/admin/orders/constants";
import { useOrderAction } from "@/features/admin/orders/hooks";
import {
  formatDateTimeVN,
  formatDateVN,
  formatOrderCode,
  formatVND,
} from "@/utils/format";

const STATUS_FLOW = ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

function StatusTimeline({ current }) {
  const idx = STATUS_FLOW.indexOf(current);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {STATUS_FLOW.map((s, i) => {
        const reached = i <= idx && idx >= 0;
        const label = ORDER_STATUSES.find((x) => x.value === s)?.label || s;
        return (
          <li key={s} className="flex flex-1 items-center gap-1 min-w-[72px]">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                reached ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            <div className="flex flex-1 flex-col">
              <span
                className={`text-[10px] font-medium ${
                  reached ? "text-secondary-800" : "text-secondary-400"
                }`}
              >
                {label}
              </span>
              {i < STATUS_FLOW.length - 1 && (
                <span
                  className={`mt-1 h-0.5 w-full ${
                    i < idx ? "bg-primary-400" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderDetailDrawer({ order, open, onOpenChange }) {
  const orderAction = useOrderAction();

  if (!order) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-4 h-40 w-full" />
        </SheetContent>
      </Sheet>
    );
  }

  const id = order._id || order.id || "";
  const normalizedStatus = String(order.status || "PENDING").toUpperCase();
  const code = formatOrderCode(order);
  const payment = order.payment || {};
  const actions = ADMIN_ORDER_ACTIONS[normalizedStatus] || [];

  const runAction = (action) => {
    orderAction.mutate({ id, action });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <SheetTitle>Đơn {code}</SheetTitle>
            <StatusBadge status={normalizedStatus} />
          </div>
          <SheetDescription>
            Đặt ngày {formatDateVN(order.createdAt)} ·{" "}
            {order.items?.length || 0} sản phẩm
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <StatusTimeline current={normalizedStatus} />
          </div>

          {/* Khách hàng / Địa chỉ */}
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-secondary-400" />
              <div className="min-w-0">
                <p className="text-xs text-secondary-500">Khách hàng</p>
                <p className="font-medium text-secondary-800">
                  {order.shippingAddress?.fullName || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 text-secondary-400" />
              <div className="min-w-0">
                <p className="text-xs text-secondary-500">Số điện thoại</p>
                <p className="font-medium text-secondary-800">
                  {order.shippingAddress?.phone || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <MapPin className="mt-0.5 h-4 w-4 text-secondary-400" />
              <div className="min-w-0">
                <p className="text-xs text-secondary-500">Địa chỉ giao</p>
                <p className="font-medium text-secondary-800">
                  {[
                    order.shippingAddress?.address,
                    order.shippingAddress?.ward,
                    order.shippingAddress?.district,
                    order.shippingAddress?.city,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Thanh toán */}
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-secondary-400" />
              <h4 className="font-semibold text-secondary-800">
                Thông tin thanh toán
              </h4>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-secondary-500">Phương thức</p>
                <div className="mt-1">
                  <StatusBadge status={payment.method || "COD"} />
                </div>
              </div>
              <div>
                <p className="text-xs text-secondary-500">Trạng thái</p>
                <div className="mt-1">
                  <StatusBadge status={payment.status || "UNPAID"} />
                </div>
              </div>
              {payment.transactionId && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-secondary-500">Mã giao dịch</p>
                  <p className="font-mono text-xs text-secondary-800 break-all">
                    {payment.transactionId}
                  </p>
                </div>
              )}
              {payment.paidAt && (
                <div>
                  <p className="text-xs text-secondary-500">Thời điểm trả</p>
                  <p className="font-medium text-secondary-800">
                    {formatDateTimeVN(payment.paidAt)}
                  </p>
                </div>
              )}
              {payment.refundTransactionId && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-secondary-500">Mã refund</p>
                  <p className="font-mono text-xs text-secondary-800 break-all">
                    {payment.refundTransactionId}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sản phẩm */}
          <div className="rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
              <Package className="h-4 w-4 text-secondary-400" />
              <h4 className="font-semibold text-secondary-800">Sản phẩm</h4>
            </div>
            <ul className="divide-y divide-gray-100">
              {(order.items || []).map((item, i) => {
                const title = item.book?.title || item.title || "Sản phẩm";
                const price = item.price || item.book?.price || 0;
                const qty = item.quantity || 1;
                return (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <img
                      src={item.book?.imageUrl || item.imageUrl}
                      alt={title}
                      className="h-12 w-9 shrink-0 rounded bg-gray-100 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-secondary-800">
                        {title}
                      </p>
                      <p className="text-xs text-secondary-500">
                        {formatVND(price)} × {qty}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-secondary-800">
                      {formatVND(price * qty)}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-1 border-t border-gray-100 px-4 py-3 text-sm">
              <div className="flex items-center justify-between text-secondary-500">
                <span>Tạm tính</span>
                <span>{formatVND(order.subtotal || 0)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex items-center justify-between text-secondary-500">
                  <span>Giảm giá</span>
                  <span>- {formatVND(order.discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-secondary-500">
                <span>Phí vận chuyển</span>
                <span>{formatVND(order.shippingFee || 0)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 text-base font-bold text-primary-600">
                <span>Tổng cộng</span>
                <span>{formatVND(order.totalAmount || 0)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {actions.length > 0 && (
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="mb-3 text-sm font-semibold text-secondary-800">
                Hành động
              </p>
              <div className="flex flex-wrap gap-2">
                {actions.map((a) => (
                  <Button
                    key={a.action}
                    onClick={() => runAction(a.action)}
                    disabled={orderAction.isPending}
                  >
                    {orderAction.isPending ? "Đang lưu..." : a.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
