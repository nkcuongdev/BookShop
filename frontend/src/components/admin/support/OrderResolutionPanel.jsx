import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  PackagePlus,
  RefreshCcw,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/hooks/useConfirm";
import { supportTicketsAPI } from "@/services/api";

const TYPES = [
  {
    value: "GUIDANCE",
    label: "Hướng dẫn / không đổi đơn",
    icon: CircleHelp,
    description: "Phản hồi hướng dẫn và hoàn tất ticket mà không thay đổi đơn hàng.",
    available: () => true,
  },
  {
    value: "APPROVE_ORDER",
    label: "Xác nhận đơn hàng",
    icon: BadgeCheck,
    description: "Xác nhận COD hoặc duyệt đơn online đã thanh toán để chuẩn bị hàng.",
    available: (order) =>
      (order.status === "PENDING" && order.payment?.method === "COD") ||
      order.status === "PAID",
  },
  {
    value: "CANCEL_ORDER",
    label: "Hủy đơn hàng",
    icon: Ban,
    description: "Yêu cầu hủy đơn; đơn đã thanh toán sẽ chuyển sang hoàn tiền.",
    available: (order) => ["PENDING", "PAID", "PROCESSING"].includes(order.status),
  },
  {
    value: "CREATE_SHIPMENT",
    label: "Tạo vận đơn",
    icon: PackagePlus,
    description: "Tạo vận đơn tự động qua đơn vị vận chuyển đã cấu hình.",
    available: (order) => order.status === "PROCESSING",
  },
  {
    value: "RETURN_REFUND",
    label: "Đổi/trả và hoàn tiền",
    icon: RotateCcw,
    description: "Tạo và duyệt yêu cầu trả hàng bằng quy trình đổi trả hiện có.",
    available: (order) => order.status === "DELIVERED",
  },
  {
    value: "PARTIAL_REFUND",
    label: "Hoàn tiền theo sản phẩm",
    icon: WalletCards,
    description: "Hoàn giá trị sản phẩm được chọn mà không đổi trạng thái đơn gốc.",
    available: (order) => order.status === "DELIVERED",
  },
  {
    value: "RESHIP",
    label: "Giao bù hoặc giao lại",
    icon: PackagePlus,
    description: "Giữ tồn kho và tạo phiếu vận chuyển bổ sung cho khách.",
    available: (order) => order.status === "DELIVERED",
  },
  {
    value: "LOST_IN_TRANSIT_REFUND",
    label: "Thất lạc — hoàn tiền",
    icon: WalletCards,
    description:
      "Xác nhận đơn thất lạc trên đường và hoàn tiền; đơn chuyển sang trạng thái hoàn tiền.",
    available: (order) =>
      order.status === "SHIPPED" && order.payment?.status === "PAID",
  },
  {
    value: "LOST_IN_TRANSIT_RESHIP",
    label: "Thất lạc — giao lại",
    icon: PackagePlus,
    description: "Xác nhận đơn thất lạc trên đường và giữ tồn kho để giao lại cho khách.",
    available: (order) => order.status === "SHIPPED",
  },
];

// Ticket categories that already identify affected products, so the return
// flow is the natural default when the order has been delivered.
const ITEM_COMPLAINT_CATEGORIES = new Set(["ITEM_FAULT", "RETURN_REQUEST"]);

const RESHIP_TYPES = new Set(["RESHIP", "LOST_IN_TRANSIT_RESHIP"]);

const ITEM_TYPES = new Set([
  "RETURN_REFUND",
  "PARTIAL_REFUND",
  "RESHIP",
  "LOST_IN_TRANSIT_REFUND",
  "LOST_IN_TRANSIT_RESHIP",
]);

const STATUS_LABELS = {
  INITIATING: "Đang khởi tạo",
  RETURNING: "Chờ khách trả hàng",
  RETURN_COMPLETED: "Đổi trả hoàn tất",
  REFUND_PENDING: "Đang hoàn tiền",
  REFUND_MANUAL_REQUIRED: "Chờ ghi nhận hoàn COD",
  REFUND_COMPLETED: "Đã hoàn tiền",
  REFUND_FAILED: "Hoàn tiền thất bại",
  PREPARING: "Đang chuẩn bị giao bù",
  SHIPPED: "Đang giao bù",
  DELIVERED: "Đã giao bù",
  CANCELLED: "Đã hủy",
  FAILED: "Khởi tạo thất bại",
  ACTION_PENDING: "Đang thực hiện",
  COMPLETED: "Đã hoàn tất",
};

const formatMoney = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;
const bookIdOf = (item) => String(item.book?._id || item.book || "");

export default function OrderResolutionPanel({ ticket, onChanged }) {
  const confirm = useConfirm();
  const resolution = ticket.resolution;
  const recoverable = ["FAILED", "REFUND_FAILED", "CANCELLED"].includes(
    resolution?.status
  );
  const failed = ["FAILED", "REFUND_FAILED"].includes(resolution?.status);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(!resolution || recoverable);
  const order = ticket.order || {};
  const availableTypes = TYPES.filter((item) => item.available(order));
  const [type, setType] = useState(() => {
    if (ITEM_COMPLAINT_CATEGORIES.has(ticket.category) && order.status === "DELIVERED") {
      return "RETURN_REFUND";
    }
    if (
      (order.status === "PENDING" && order.payment?.method === "COD") ||
      order.status === "PAID"
    ) {
      return "APPROVE_ORDER";
    }
    if (order.status === "PROCESSING") return "CREATE_SHIPMENT";
    // A complaint about an in-transit order is usually a lost parcel.
    if (order.status === "SHIPPED" && ticket.category === "NOT_RECEIVED") {
      return order.payment?.status === "PAID"
        ? "LOST_IN_TRANSIT_REFUND"
        : "LOST_IN_TRANSIT_RESHIP";
    }
    return "GUIDANCE";
  });
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(
      (ticket.requestDetails?.items || []).map((item) => [
        String(item.book?._id || item.book),
        item.quantity,
      ])
    )
  );
  const [note, setNote] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [shippingProvider, setShippingProvider] = useState("ghn");
  const typeMeta = TYPES.find((item) => item.value === resolution?.type);
  const providersQuery = useQuery({
    queryKey: ["admin", "support-shipping-providers"],
    queryFn: () =>
      supportTicketsAPI
        .getShippingProviders()
        .then((response) => response.data.providers || []),
  });
  const selectedProvider = (providersQuery.data || []).find(
    (provider) => provider.id === shippingProvider
  );
  const actionUnavailable =
    type === "CREATE_SHIPMENT" && selectedProvider?.enabled !== true;

  const selectedItems = useMemo(
    () =>
      (order.items || [])
        .filter((item) => quantities[bookIdOf(item)])
        .map((item) => ({
          bookId: bookIdOf(item),
          quantity: quantities[bookIdOf(item)],
        })),
    [order.items, quantities]
  );

  const estimatedRefund = useMemo(
    () =>
      (order.items || []).reduce(
        (sum, item) =>
          sum + (quantities[bookIdOf(item)] || 0) * Number(item.price || 0),
        0
      ),
    [order.items, quantities]
  );

  const closeAndRefresh = () => {
    setOpen(false);
    onChanged();
  };

  const createMutation = useMutation({
    mutationFn: (payload) =>
      supportTicketsAPI.createResolution(ticket._id, payload),
    onSuccess: () => {
      toast.success("Đã tạo phương án xử lý đơn hàng");
      setEditing(false);
      closeAndRefresh();
    },
    onError: (error) =>
      toast.error(error.message || "Không thể xử lý đơn hàng"),
  });

  const manualMutation = useMutation({
    mutationFn: () =>
      supportTicketsAPI.completeManualRefund(ticket._id, transactionId.trim()),
    onSuccess: () => {
      toast.success("Đã ghi nhận hoàn tiền");
      setTransactionId("");
      closeAndRefresh();
    },
    onError: (error) =>
      toast.error(error.message || "Không thể ghi nhận hoàn tiền"),
  });

  const shippingMutation = useMutation({
    mutationFn: (payload) =>
      supportTicketsAPI.updateReship(ticket._id, payload),
    onSuccess: () => {
      toast.success("Đã cập nhật phiếu giao bù");
      closeAndRefresh();
    },
    onError: (error) =>
      toast.error(error.message || "Không thể cập nhật phiếu giao bù"),
  });

  const submit = async () => {
    const requiresItems = ITEM_TYPES.has(type);
    if (requiresItems && !selectedItems.length) {
      toast.error("Vui lòng chọn ít nhất một sản phẩm");
      return;
    }
    if (type === "GUIDANCE" && note.trim().length < 3) {
      toast.error("Vui lòng nhập nội dung hướng dẫn khách hàng");
      return;
    }
    const selectedType = TYPES.find((item) => item.value === type);
    const description =
      type === "GUIDANCE"
        ? "Ticket sẽ được hoàn tất mà không thay đổi trạng thái đơn hàng."
        : type === "APPROVE_ORDER"
          ? "Đơn hàng sẽ chuyển sang trạng thái đang chuẩn bị."
          : type === "CANCEL_ORDER"
            ? "Hệ thống sẽ yêu cầu hủy đơn và hoàn tiền nếu khách đã thanh toán."
            : type === "CREATE_SHIPMENT"
              ? "Hệ thống sẽ tự tạo mã vận đơn và thời gian giao dự kiến."
              : type === "RESHIP" || type === "LOST_IN_TRANSIT_RESHIP"
        ? "Hệ thống sẽ giữ tồn kho ngay khi tạo phiếu giao bù."
        : type === "LOST_IN_TRANSIT_REFUND"
          ? `Đơn sẽ chuyển sang hoàn tiền với khoản hoàn dự kiến ${formatMoney(estimatedRefund)}.`
          : type === "PARTIAL_REFUND"
          ? `Khoản hoàn dự kiến ${formatMoney(estimatedRefund)}; hệ thống sẽ tự phân bổ giảm giá.`
          : "Hệ thống sẽ tạo và duyệt yêu cầu đổi trả cho các sản phẩm đã chọn.";
    const accepted = await confirm({
      title: `Xác nhận ${selectedType.label.toLowerCase()}`,
      description,
      confirmText: "Xác nhận xử lý",
    });
    if (accepted) {
      createMutation.mutate({
        type,
        items: requiresItems ? selectedItems : [],
        note,
      });
    }
  };

  const toggleItem = (item, checked) => {
    const id = bookIdOf(item);
    setQuantities((current) => ({ ...current, [id]: checked ? 1 : 0 }));
  };

  const renderForm = () => (
    <div className="space-y-6">
      {failed && (
        <div className="flex gap-3 rounded-xl bg-danger-muted p-3 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Phương án trước chưa hoàn tất. Hãy kiểm tra nguyên nhân trước khi chọn lại.
        </div>
      )}

      <div>
        <Label>1. Chọn phương án</Label>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {availableTypes.map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={
                item.value === "CREATE_SHIPMENT" &&
                selectedProvider?.enabled !== true
              }
              onClick={() => setType(item.value)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                type === item.value
                  ? "border-primary bg-primary-50 ring-1 ring-primary/20"
                  : "hover:bg-muted"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <item.icon className="size-5 text-primary" />
              <p className="mt-3 text-sm font-semibold">{item.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {type === "CREATE_SHIPMENT" && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {selectedProvider?.description || "Đang kiểm tra đơn vị vận chuyển..."}
        </p>
      )}

      {ITEM_TYPES.has(type) && <div>
        <Label>2. Chọn sản phẩm và số lượng</Label>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {(order.items || []).map((item) => {
            const id = bookIdOf(item);
            const checked = Boolean(quantities[id]);
            return (
              <div
                key={id}
                className="flex items-center gap-3 rounded-xl border p-3"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => toggleItem(item, value === true)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Đã mua {item.quantity} · {formatMoney(item.price)}/quyển
                  </p>
                </div>
                {checked && (
                  <Input
                    aria-label={`Số lượng ${item.title}`}
                    className="w-20"
                    type="number"
                    min="1"
                    max={item.quantity}
                    value={quantities[id]}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [id]: Math.max(
                          1,
                          Math.min(item.quantity, Number(event.target.value) || 1)
                        ),
                      }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>}

      {(type === "PARTIAL_REFUND" || type === "LOST_IN_TRANSIT_REFUND") && selectedItems.length > 0 && (
        <p className="rounded-lg bg-warning-muted px-3 py-2 text-sm text-warning-strong">
          Giá trị sản phẩm dự kiến: {formatMoney(estimatedRefund)}. Số tiền
          thực tế sẽ được tính sau khi phân bổ giảm giá của đơn.
        </p>
      )}

      <div>
        <Label htmlFor="resolution-note">
          {ITEM_TYPES.has(type) ? "3. Ghi chú xử lý" : "2. Nội dung xử lý"}
        </Label>
        <Textarea
          id="resolution-note"
          className="mt-2"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Hướng dẫn cho khách hoặc lý do xử lý..."
        />
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button
          onClick={submit}
          disabled={
            (ITEM_TYPES.has(type) && !selectedItems.length) ||
            (type === "GUIDANCE" && note.trim().length < 3) ||
            actionUnavailable ||
            createMutation.isPending
          }
          loading={createMutation.isPending}
        >
          Thực hiện phương án
        </Button>
      </div>
    </div>
  );

  const renderResolutionDetails = () => (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-muted p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Phương án đang áp dụng
          </p>
          <h3 className="mt-1 font-semibold">{typeMeta?.label}</h3>
        </div>
        <Badge
          className={
            failed
              ? "bg-danger-muted text-danger-strong"
              : "bg-info-muted text-info-strong"
          }
        >
          {STATUS_LABELS[resolution.status] || resolution.status}
        </Badge>
      </div>

      {resolution.items?.length > 0 && <div>
        <Label>Sản phẩm áp dụng</Label>
        <div className="mt-2 divide-y rounded-xl border">
          {resolution.items?.map((item) => (
            <div
              key={bookIdOf(item)}
              className="flex justify-between gap-3 p-3 text-sm"
            >
              <span>{item.title}</span>
              <strong>{item.quantity} quyển</strong>
            </div>
          ))}
        </div>
      </div>}

      {resolution.amount > 0 && (
        <p className="rounded-xl bg-primary-50 p-4 text-sm">
          Số tiền hoàn:{" "}
          <strong className="text-primary">{formatMoney(resolution.amount)}</strong>
        </p>
      )}

      {resolution.note && (
        <div>
          <Label>Ghi chú</Label>
          <p className="mt-2 rounded-xl border p-3 text-sm text-muted-foreground">
            {resolution.note}
          </p>
        </div>
      )}

      {resolution.returnRequest && (
        <div className="rounded-xl bg-muted p-4 text-sm">
          <p>
            Mã trả hàng:{" "}
            <strong>{resolution.returnRequest.returnCode || "Đang tạo"}</strong>
          </p>
          <p className="mt-1">Trạng thái: {resolution.returnRequest.status}</p>
        </div>
      )}

      {resolution.status === "REFUND_MANUAL_REQUIRED" && (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="manual-refund">Mã giao dịch hoàn COD</Label>
            <Input
              id="manual-refund"
              className="mt-1"
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
              placeholder="Nhập mã giao dịch/chuyển khoản"
            />
          </div>
          <Button
            onClick={() => manualMutation.mutate()}
            disabled={transactionId.trim().length < 3 || manualMutation.isPending}
          >
            <CheckCircle2 className="size-4" /> Xác nhận đã hoàn
          </Button>
        </div>
      )}

      {RESHIP_TYPES.has(resolution.type) && resolution.status === "PREPARING" && (
        <div className="space-y-3 border-t pt-4">
          <div>
            <Label htmlFor="support-shipping-provider">Đơn vị vận chuyển</Label>
            <select
              id="support-shipping-provider"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={shippingProvider}
              onChange={(event) => setShippingProvider(event.target.value)}
            >
              {(providersQuery.data || []).map((provider) => (
                <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
                  {provider.name}{provider.enabled ? "" : " — Chưa khả dụng"}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedProvider?.description || "Đang tải danh sách đơn vị vận chuyển..."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mã vận đơn và thời gian giao dự kiến sẽ được tạo tự động.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                shippingMutation.mutate({
                  status: "SHIPPED",
                  provider: shippingProvider,
                })
              }
              disabled={
                !selectedProvider?.enabled ||
                shippingMutation.isPending
              }
              loading={shippingMutation.isPending}
            >
              Tạo vận đơn và bàn giao
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const accepted = await confirm({
                  title: "Hủy phiếu giao bù?",
                  description: "Tồn kho đã giữ sẽ được hoàn lại.",
                  confirmText: "Hủy phiếu",
                  variant: "destructive",
                });
                if (accepted) shippingMutation.mutate({ status: "CANCELLED" });
              }}
            >
              Hủy phiếu
            </Button>
          </div>
        </div>
      )}

      {RESHIP_TYPES.has(resolution.type) && resolution.status === "SHIPPED" && (
        <div className="rounded-xl bg-muted p-4 text-sm">
          <p>
            {resolution.shipment?.carrier} ·{" "}
            <strong>{resolution.shipment?.trackingNumber}</strong>
          </p>
          {resolution.shipment?.estimatedDelivery && (
            <p className="mt-1 text-muted-foreground">
              Dự kiến giao: {new Date(resolution.shipment.estimatedDelivery).toLocaleDateString("vi-VN")}
            </p>
          )}
          <Button
            className="mt-3"
            size="sm"
            onClick={() => shippingMutation.mutate({ status: "DELIVERED" })}
          >
            Xác nhận đã giao
          </Button>
        </div>
      )}

      {recoverable && (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <RefreshCcw className="size-4" /> Chọn phương án khác
        </Button>
      )}

      {resolution.status === "REFUND_FAILED" && (
        <p className="rounded-lg bg-danger-muted p-3 text-sm text-danger-strong">
          Cổng thanh toán đã từ chối khoản hoàn. Hãy kiểm tra mã giao dịch rồi
          chọn lại phương án; lần thử mới sẽ dùng mã chống trùng riêng.
        </p>
      )}
    </div>
  );

  return (
    <>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-primary-50 p-2 text-primary">
            {typeMeta ? (
              <typeMeta.icon className="size-5" />
            ) : (
              <PackagePlus className="size-5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Thao tác đơn hàng
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">
                {resolution ? typeMeta?.label : "Chưa có thao tác xử lý"}
              </p>
              {resolution && (
                <Badge
                  className={
                    failed
                      ? "bg-danger-muted text-danger-strong"
                      : "bg-info-muted text-info-strong"
                  }
                >
                  {STATUS_LABELS[resolution.status] || resolution.status}
                </Badge>
              )}
            </div>
            {!resolution && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hiển thị hành động phù hợp với trạng thái {order.status}.
              </p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={resolution ? "outline" : "default"}
          onClick={() => setOpen(true)}
        >
          {resolution ? "Xem và quản lý" : "Tạo phương án"}
          <ChevronRight className="size-4" />
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto p-0">
          <DialogHeader className="sticky top-0 z-10 border-b bg-card px-6 py-5">
            <DialogTitle>Xử lý đơn hàng {order.orderCode}</DialogTitle>
            <DialogDescription>
              Thực hiện nghiệp vụ cho ticket {ticket.ticketCode}; mọi thay đổi đều
              được ghi vào lịch sử.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 pt-6">
            {resolution && !editing ? renderResolutionDetails() : renderForm()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
