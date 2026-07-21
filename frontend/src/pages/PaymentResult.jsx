import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Home,
  LoaderCircle,
  Package,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { statusSurfaceVariants } from "@/components/ui/status-badge";
import { useCart } from "@/context/CartContext";
import { ordersAPI } from "@/services/api";
import { cn } from "@/lib/utils";

const STATUS_META = {
  checking: {
    icon: LoaderCircle,
    title: "Đang xác minh thanh toán",
    desc: "Hệ thống đang đọc trạng thái đơn hàng đã được backend xác nhận.",
    intent: "info",
    spin: true,
  },
  success: {
    icon: CheckCircle2,
    title: "Thanh toán thành công",
    desc: "Đơn hàng đã được backend ghi nhận thanh toán thành công.",
    intent: "success",
  },
  failed: {
    icon: AlertCircle,
    title: "Thanh toán chưa thành công",
    desc: "Giao dịch không thành công. Bạn có thể mở đơn hàng để thử lại.",
    intent: "danger",
  },
  invalid: {
    icon: AlertCircle,
    title: "Không xác định được đơn hàng",
    desc: "Đường dẫn trả về thiếu mã đơn hợp lệ. Vui lòng mở danh sách đơn hàng để kiểm tra.",
    intent: "warning",
  },
  returned: {
    icon: LoaderCircle,
    title: "Đang chờ cổng thanh toán xác nhận",
    desc: "Trang sẽ tự cập nhật khi IPN/callback được backend xử lý.",
    intent: "info",
    spin: true,
  },
  unconfirmed: {
    icon: AlertCircle,
    title: "Chưa nhận được xác nhận thanh toán",
    desc: "Cổng thanh toán chưa gửi xác nhận về BookShop. Bạn có thể kiểm tra lại hoặc mở đơn hàng để theo dõi.",
    intent: "warning",
  },
  refunding: {
    icon: LoaderCircle,
    title: "Đang hoàn tiền",
    desc: "Khoản thanh toán đến sau khi đơn đã đóng và đang được hoàn lại.",
    intent: "warning",
    spin: true,
  },
  refunded: {
    icon: CheckCircle2,
    title: "Đã hoàn tiền",
    desc: "Khoản thanh toán đã được hoàn lại thành công.",
    intent: "success",
  },
  cancelled: {
    icon: AlertCircle,
    title: "Đơn hàng đã hủy",
    desc: "Đơn hàng đã đóng và không ghi nhận thanh toán thành công.",
    intent: "neutral",
  },
  error: {
    icon: AlertCircle,
    title: "Chưa kiểm tra được thanh toán",
    desc: "Không thể tải trạng thái đơn lúc này. Vui lòng mở chi tiết đơn hàng để kiểm tra.",
    intent: "danger",
  },
};

const MAX_AUTO_ATTEMPTS = 8;
const BASE_POLL_DELAY_MS = 1_000;
const MAX_POLL_DELAY_MS = 8_000;

function deriveStatus(order) {
  if (order?.status === "REFUNDED") return "refunded";
  if (order?.status === "REFUNDING") return "refunding";
  if (order?.payment?.status === "PAID") return "success";
  if (order?.status === "FAILED") return "failed";
  if (order?.status === "CANCELLED") return "cancelled";
  return "returned";
}

export default function PaymentResult() {
  const { refreshCart, removePurchasedItems } = useCart();
  const removedItemsRef = useRef("");
  const [params] = useSearchParams();
  const rawOrderId = params.get("orderId") || "";
  const orderId = /^[0-9a-f]{24}$/i.test(rawOrderId) ? rawOrderId : "";
  const initialOrderCode =
    params.get("orderCode") || extractOrderCodeFromTxn(rawOrderId) || "";
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState(
    orderId || initialOrderCode ? "checking" : "invalid"
  );
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!orderId && !initialOrderCode) return undefined;
    let active = true;
    let timer;
    let attempts = 0;

    const load = async () => {
      attempts += 1;
      try {
        const response = orderId
          ? await ordersAPI.getById(orderId)
          : await ordersAPI.getByCode(initialOrderCode);
        if (!active) return;
        const nextOrder = response?.data?.order;
        if (!nextOrder) throw new Error("Order not found");
        const nextStatus = deriveStatus(nextOrder);
        setOrder(nextOrder);
        setStatus(nextStatus);
        if (nextStatus === "returned") {
          if (attempts >= MAX_AUTO_ATTEMPTS) {
            setStatus("unconfirmed");
            return;
          }
          const delay = Math.min(
            BASE_POLL_DELAY_MS * 2 ** Math.max(attempts - 1, 0),
            MAX_POLL_DELAY_MS
          );
          timer = window.setTimeout(load, delay);
        }
      } catch {
        if (!active) return;
        if (attempts >= MAX_AUTO_ATTEMPTS) {
          setStatus("error");
          return;
        }
        const delay = Math.min(
          BASE_POLL_DELAY_MS * 2 ** Math.max(attempts - 1, 0),
          MAX_POLL_DELAY_MS
        );
        timer = window.setTimeout(load, delay);
      }
    };

    load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [initialOrderCode, orderId, refreshNonce]);

  useEffect(() => {
    if (!orderId && !initialOrderCode) return undefined;
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      setRefreshNonce((value) => value + 1);
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [initialOrderCode, orderId]);

  useEffect(() => {
    if (status !== "success" || !order) return;
    const key = String(order._id || order.id || order.orderCode || "");
    if (!key || removedItemsRef.current === key) return;
    removedItemsRef.current = key;
    removePurchasedItems?.(order.items || []);
    if (typeof refreshCart === "function") refreshCart().catch(() => {});
  }, [order, refreshCart, removePurchasedItems, status]);

  const meta = STATUS_META[status] || STATUS_META.error;
  const Icon = meta.icon;
  const resolvedOrderId = order?._id || order?.id || orderId;
  const resolvedOrderCode = order?.orderCode || initialOrderCode;

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-muted px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card
          className="p-6 sm:p-8 text-center"
          data-testid="payment-result"
          data-status={status}
        >
          <div
            className={cn(
              "mx-auto mb-5 flex size-16 items-center justify-center rounded-full border",
              statusSurfaceVariants({ intent: meta.intent })
            )}
          >
            <Icon className={`size-8 ${meta.spin ? "animate-spin" : ""}`} />
          </div>

          <h1 className="text-h1 font-display font-bold text-foreground">
            {meta.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {meta.desc}
          </p>

          {resolvedOrderCode && (
            <div className="mt-5 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
              <span className="text-muted-foreground">Mã đơn hàng: </span>
              <span className="font-mono font-semibold text-foreground">
                {resolvedOrderCode}
              </span>
            </div>
          )}

          {["unconfirmed", "error"].includes(status) && (
            <Button
              type="button"
              variant="outline"
              className="mt-5"
              onClick={() => {
                setStatus("checking");
                setRefreshNonce((value) => value + 1);
              }}
            >
              Kiểm tra lại
            </Button>
          )}

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Button asChild>
              <Link
                to={
                  resolvedOrderId
                    ? `/profile/orders/${resolvedOrderId}`
                    : "/profile/orders"
                }
              >
                <Package className="size-4" />
                Xem đơn hàng
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/products">
                <ShoppingBag className="size-4" />
                Mua tiếp
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">
                <Home className="size-4" />
                Trang chủ
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}

function extractOrderCodeFromTxn(value) {
  const parts = String(value || "").split("_");
  if (parts.length < 3) return "";
  return parts.slice(1, -1).join("_");
}
