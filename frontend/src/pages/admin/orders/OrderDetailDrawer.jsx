import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  MapPin,
  Package,
  Phone,
  StickyNote,
  Truck,
  User,
} from "lucide-react";
import { useState } from "react";
import {
  ADMIN_ORDER_ACTIONS,
  ORDER_STATUSES,
} from "@/features/admin/orders/constants";
import {
  useOrderAction,
  useReturnRequestAction,
} from "@/features/admin/orders/hooks";
import {
  formatDateTimeVN,
  formatDateVN,
  formatOrderCode,
  formatVND,
} from "@/utils/format";
import { toast } from "@/components/ui/sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";
import OrderReceiptPrintButton from "@/components/order/OrderReceipt";
import AdminReturnRequestCard from "@/components/admin/orders/AdminReturnRequestCard";

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
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <div className="flex flex-1 flex-col">
              <span
                className={`text-[10px] font-medium ${
                  reached ? "text-foreground" : "text-muted-foreground/70"
                }`}
              >
                {label}
              </span>
              {i < STATUS_FLOW.length - 1 && (
                <span
                  className={`mt-1 h-0.5 w-full ${
                    i < idx ? "bg-primary-400" : "bg-border"
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
  const returnRequestAction = useReturnRequestAction();
  const confirm = useConfirm();
  const { user } = useAuth();
  const shippingVersion = [
    order?._id || order?.id || "",
    order?.carrier || "",
    order?.trackingNumber || "",
    order?.estimatedDelivery || "",
  ].join("|");
  const defaultShippingForm = {
    carrier: order?.carrier || "",
    trackingNumber: order?.trackingNumber || "",
    estimatedDelivery: order?.estimatedDelivery?.slice?.(0, 10) || "",
  };
  const [shippingDraft, setShippingDraft] = useState({
    version: "",
    values: defaultShippingForm,
  });
  const shippingForm =
    shippingDraft.version === shippingVersion
      ? shippingDraft.values
      : defaultShippingForm;
  const setShippingForm = (updater) => {
    setShippingDraft((current) => {
      const currentValues =
        current.version === shippingVersion ? current.values : defaultShippingForm;
      return {
        version: shippingVersion,
        values:
          typeof updater === "function" ? updater(currentValues) : updater,
      };
    });
  };

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
  const shippingDiscount =
    Number(order.shippingDiscountAmount) ||
    (order.voucher?.scope === "shipping"
      ? Number(order.discountAmount) || 0
      : 0);
  const orderDiscount = Math.max(
    0,
    (Number(order.discountAmount) || 0) - shippingDiscount
  );
  const isGhnOrder = order.shipment?.provider === "ghn";
  const ghnShipmentCancelled = Boolean(order.shipment?.cancelledAt);
  const usesGhnAutomation = isGhnOrder && !ghnShipmentCancelled;
  const hasGhnShipment = Boolean(order.shipment?.providerOrderCode);
  const simulation = order.shipment?.simulation || {};
  const simulationCompleted = Boolean(simulation.completedAt);
  // The shipment sandbox drives createShipment/cancelShipment, both gated on
  // order.fulfill, so it belongs to the warehouse rather than to support.
  const showSandboxPanel =
    usesGhnAutomation &&
    can(user, "order.fulfill") &&
    ["PROCESSING", "SHIPPED", "DELIVERED"].includes(normalizedStatus);
  const actions = (ADMIN_ORDER_ACTIONS[normalizedStatus] || []).filter(
    (action) =>
      (!action.paymentMethods || action.paymentMethods.includes(payment.method)) &&
      !(["ship", "deliver"].includes(action.action) && usesGhnAutomation) &&
      (!action.permission || can(user, action.permission))
  );

  const runAction = async (action) => {
    if (action === "cancel") {
      // Huỷ đơn đã thanh toán không kết thúc ngay: đơn chuyển sang CANCELLING,
      // hệ thống huỷ vận đơn (nếu có) rồi hoàn tiền qua cổng thanh toán. Mô tả
      // đúng quá trình này để CSKH không nghĩ đã xong khi bấm xong.
      const isPrepaid = payment.method !== "COD" && payment.status === "PAID";
      const steps = ["Tồn kho và lượt voucher đã giữ cho đơn này sẽ được hoàn lại."];
      if (hasGhnShipment && !ghnShipmentCancelled) {
        steps.push("Vận đơn đã tạo sẽ được yêu cầu huỷ với đơn vị vận chuyển.");
      }
      if (isPrepaid) {
        steps.push(
          "Đơn đã thanh toán nên sẽ chuyển sang trạng thái đang huỷ, tiền được hoàn tự động qua cổng thanh toán và có thể mất vài phút để hoàn tất."
        );
      }
      const accepted = await confirm({
        title: "Huỷ đơn hàng?",
        description: steps.join(" "),
        confirmText: isPrepaid ? "Huỷ đơn và hoàn tiền" : "Huỷ đơn",
        variant: "destructive",
      });
      if (accepted) {
        orderAction.mutate({
          id,
          action,
          payload: { reason: "Cancelled by admin" },
        });
      }
      return;
    }
    if (action === "ship") {
      const carrier = shippingForm.carrier.trim();
      const trackingNumber = shippingForm.trackingNumber.trim();
      if (carrier.length < 2 || trackingNumber.length < 3) {
        toast.error("Vui lòng nhập đơn vị vận chuyển và mã vận đơn hợp lệ");
        return;
      }
      orderAction.mutate({
        id,
        action,
        payload: {
          carrier,
          trackingNumber,
          estimatedDelivery: shippingForm.estimatedDelivery || undefined,
        },
      });
      return;
    }
    orderAction.mutate({ id, action });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="flex flex-wrap items-center gap-3">
              <SheetTitle>Đơn {code}</SheetTitle>
              <StatusBadge status={normalizedStatus} />
            </div>
            <OrderReceiptPrintButton order={order} className="shrink-0" />
          </div>

          <SheetDescription>
            Đặt ngày {formatDateVN(order.createdAt)} ·{" "}
            {order.items?.length || 0} sản phẩm
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-border bg-muted p-4">
            <StatusTimeline current={normalizedStatus} />
          </div>

          {order.returnRequest && (
            <AdminReturnRequestCard
              key={order.returnRequest._id || order.returnRequest.id}
              request={order.returnRequest}
              readOnly={!can(user, "order.support")}
              resolving={returnRequestAction.isPending}
              onResolve={(status, adminNote, options = {}) =>
                returnRequestAction.mutate({ id, status, adminNote, ...options })
              }
            />
          )}

          {(order.carrier || order.trackingNumber || order.estimatedDelivery) && (
              <div className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Truck className="size-4 text-muted-foreground/70" />
                  <h4 className="text-sm font-semibold text-foreground">Thông tin vận chuyển</h4>
                </div>
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Đơn vị vận chuyển</dt>
                    <dd className="font-medium text-foreground">{order.carrier || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Mã vận đơn</dt>
                    <dd className="font-mono text-foreground">{order.trackingNumber || "—"}</dd>
                  </div>
                  {order.estimatedDelivery && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Giao dự kiến</dt>
                      <dd className="font-medium text-foreground">
                        {formatDateVN(order.estimatedDelivery)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

          {/* Khách hàng / Địa chỉ */}
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 size-4 text-muted-foreground/70" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Khách hàng</p>
                <p className="font-medium text-foreground">
                  {order.shippingAddress?.fullName || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 size-4 text-muted-foreground/70" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Số điện thoại</p>
                <p className="font-medium text-foreground">
                  {order.shippingAddress?.phone || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <MapPin className="mt-0.5 size-4 text-muted-foreground/70" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Địa chỉ giao</p>
                <p className="font-medium text-foreground">
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
            {order.note && (
              <div className="flex items-start gap-2 border-t border-border pt-3 sm:col-span-2">
                <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Yêu cầu giao hàng</p>
                  <p className="whitespace-pre-wrap break-words font-medium text-foreground">
                    {order.note}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Thanh toán */}
          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground/70" />
              <h4 className="text-sm font-semibold text-foreground">
                Thông tin thanh toán
              </h4>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Phương thức</p>
                <div className="mt-1">
                  <StatusBadge status={payment.method || "COD"} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trạng thái</p>
                <div className="mt-1">
                  <StatusBadge status={payment.status || "UNPAID"} />
                </div>
              </div>
              {payment.transactionId && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Mã giao dịch</p>
                  <p className="font-mono text-xs text-foreground break-all">
                    {payment.transactionId}
                  </p>
                </div>
              )}
              {payment.paidAt && (
                <div>
                  <p className="text-xs text-muted-foreground">Thời điểm trả</p>
                  <p className="font-medium text-foreground">
                    {formatDateTimeVN(payment.paidAt)}
                  </p>
                </div>
              )}
              {payment.refundTransactionId && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Mã refund</p>
                  <p className="font-mono text-xs text-foreground break-all">
                    {payment.refundTransactionId}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sản phẩm */}
          <div className="rounded-xl border border-border">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Package className="size-4 text-muted-foreground/70" />
              <h4 className="text-sm font-semibold text-foreground">Sản phẩm</h4>
            </div>
            <ul className="divide-y divide-border">
              {(order.items || []).map((item, i) => {
                const title = item.book?.title || item.title || "Sản phẩm";
                const price = item.price || item.book?.price || 0;
                const qty = item.quantity || 1;
                return (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <img
                      src={item.book?.imageUrl || item.imageUrl}
                      alt={title}
                      className="h-12 w-9 shrink-0 rounded-lg bg-muted object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatVND(price)} × {qty}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {formatVND(price * qty)}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-1 border-t border-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Tạm tính</span>
                <span>{formatVND(order.subtotal || 0)}</span>
              </div>
              {orderDiscount > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>
                    Giảm giá đơn hàng
                    {order.voucher?.code ? ` (${order.voucher.code})` : ""}
                  </span>
                  <span>- {formatVND(orderDiscount)}</span>
                </div>
              )}
              {shippingDiscount > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>
                    Giảm phí vận chuyển
                    {order.shippingVoucher?.code
                      ? ` (${order.shippingVoucher.code})`
                      : order.voucher?.scope === "shipping" && order.voucher?.code
                        ? ` (${order.voucher.code})`
                        : ""}
                  </span>
                  <span>- {formatVND(shippingDiscount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Phí vận chuyển</span>
                <span>{formatVND(order.shippingFee || 0)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 text-base font-bold text-primary">
                <span>Tổng cộng</span>
                <span>{formatVND(order.totalAmount || 0)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {(actions.length > 0 || showSandboxPanel) && (
            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Hành động
              </p>
              {showSandboxPanel && (
                <div className="mb-4 rounded-xl border border-info/30 bg-info-muted p-3">
                  <p className="text-sm font-semibold text-info-strong">
                    Vận chuyển thử nghiệm qua GHN Sandbox
                  </p>
                  <p className="mt-1 text-xs text-info-strong">
                    {!hasGhnShipment
                      ? "Tạo vận đơn trên GHN Sandbox. Không có shipper thật và không phát sinh cước."
                      : simulationCompleted
                        ? `Vận đơn test ${order.shipment.providerOrderCode} đã hoàn tất mô phỏng.`
                        : `Vận đơn test ${order.shipment.providerOrderCode} đang ở trạng thái ${order.shipment.providerStatus || "ready_to_pick"}. Project sẽ tự chuyển bước mô phỏng.`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!hasGhnShipment ? (
                      <Button
                        onClick={() =>
                          orderAction.mutate({ id, action: "createShipment" })
                        }
                        disabled={orderAction.isPending}
                      >
                        Tạo vận đơn Sandbox
                      </Button>
                    ) : !simulationCompleted ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() =>
                            orderAction.mutate({
                              id,
                              action: simulation.enabled
                                ? "pauseShipmentSimulation"
                                : "resumeShipmentSimulation",
                            })
                          }
                          disabled={orderAction.isPending}
                        >
                          {simulation.enabled ? "Tạm dừng mô phỏng" : "Tiếp tục mô phỏng"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            orderAction.mutate({
                              id,
                              action: "advanceShipmentSimulation",
                            })
                          }
                          disabled={orderAction.isPending}
                        >
                          Chuyển bước ngay
                        </Button>
                        {normalizedStatus === "PROCESSING" && (
                          <Button
                            variant="outline"
                            onClick={async () => {
                              const accepted = await confirm({
                                title: "Hủy vận đơn Sandbox?",
                                description:
                                  "Vận đơn thử nghiệm sẽ bị hủy và mô phỏng sẽ dừng lại.",
                                confirmText: "Hủy vận đơn",
                                variant: "destructive",
                              });
                              if (accepted) {
                                orderAction.mutate({ id, action: "cancelShipment" });
                              }
                            }}
                            disabled={orderAction.isPending}
                          >
                            Hủy vận đơn Sandbox
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs font-medium text-success-strong">
                        Mô phỏng đã hoàn tất
                      </span>
                    )}
                  </div>
                </div>
              )}
              {actions.some((action) => action.action === "ship") && (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground" htmlFor="carrier">
                      Đơn vị vận chuyển
                    </label>
                    <Input
                      id="carrier"
                      value={shippingForm.carrier}
                      maxLength={100}
                      placeholder="Ví dụ: GHN"
                      onChange={(event) =>
                        setShippingForm((current) => ({
                          ...current,
                          carrier: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground" htmlFor="trackingNumber">
                      Mã vận đơn
                    </label>
                    <Input
                      id="trackingNumber"
                      value={shippingForm.trackingNumber}
                      maxLength={100}
                      placeholder="Nhập mã vận đơn"
                      onChange={(event) =>
                        setShippingForm((current) => ({
                          ...current,
                          trackingNumber: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-muted-foreground" htmlFor="estimatedDelivery">
                      Ngày giao dự kiến (không bắt buộc)
                    </label>
                    <Input
                      id="estimatedDelivery"
                      type="date"
                      value={shippingForm.estimatedDelivery}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(event) =>
                        setShippingForm((current) => ({
                          ...current,
                          estimatedDelivery: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {actions.map((a) => (
                  <Button
                    key={a.action}
                    onClick={() => runAction(a.action)}
                    disabled={orderAction.isPending}
                    variant={a.variant || "default"}
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
