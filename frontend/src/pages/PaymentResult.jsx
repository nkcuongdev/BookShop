import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Home,
  Package,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { API_BASE } from "@/services/api/client";
import { useCart } from "@/context/CartContext";

const STATUS_META = {
  success: {
    icon: CheckCircle2,
    title: "Thanh toán thành công",
    desc: "Đơn hàng đã được ghi nhận thanh toán. Bạn có thể xem chi tiết đơn hoặc tiếp tục mua sách.",
    tone: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  failed: {
    icon: AlertCircle,
    title: "Thanh toán chưa thành công",
    desc: "Giao dịch chưa hoàn tất. Bạn có thể vào đơn hàng để thử thanh toán lại.",
    tone: "text-red-600 bg-red-50 border-red-200",
  },
  invalid: {
    icon: AlertCircle,
    title: "Không xác thực được thanh toán",
    desc: "Thông tin trả về từ cổng thanh toán không hợp lệ. Vui lòng kiểm tra lại đơn hàng.",
    tone: "text-amber-600 bg-amber-50 border-amber-200",
  },
  returned: {
    icon: CheckCircle2,
    title: "Đã quay lại từ cổng thanh toán",
    desc: "Hệ thống đang chờ cổng thanh toán xác nhận qua IPN/callback. Bạn có thể kiểm tra trạng thái trong đơn hàng.",
    tone: "text-sky-600 bg-sky-50 border-sky-200",
  },
};

export default function PaymentResult() {
  const { clearCart } = useCart();
  const clearedCartRef = useRef(false);
  const [params] = useSearchParams();
  const gateway = params.get("gateway") || "";
  const momoResultCode = params.get("resultCode");
  const status = useMemo(() => {
    if (gateway === "momo" && momoResultCode != null) {
      return Number(momoResultCode) === 0 ? "success" : "failed";
    }
    return params.get("status") || "returned";
  }, [gateway, momoResultCode, params]);
  const orderId = params.get("orderId") || "";
  const orderCode =
    params.get("orderCode") ||
    extractOrderCodeFromTxn(params.get("orderId") || "") ||
    "";
  const [syncing, setSyncing] = useState(false);
  const meta = STATUS_META[status] || STATUS_META.returned;
  const Icon = meta.icon;

  useEffect(() => {
    if (status === "success" && !clearedCartRef.current) {
      clearedCartRef.current = true;
      clearCart();
    }
  }, [clearCart, status]);

  useEffect(() => {
    if (gateway !== "momo" || !params.get("signature")) return;

    const syncMomoReturn = async () => {
      setSyncing(true);
      try {
        await fetch(`${API_BASE}/orders/webhook/momo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(params.entries())),
        });
      } catch (error) {
        console.error("[payment-result/momo]", error);
      } finally {
        setSyncing(false);
      }
    };

    syncMomoReturn();
  }, [gateway, params]);

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card className="p-6 sm:p-8 text-center">
          <div
            className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border ${meta.tone}`}
          >
            <Icon className="h-8 w-8" />
          </div>

          <h1 className="text-2xl font-display font-bold text-secondary-900">
            {meta.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-secondary-600">
            {meta.desc}
          </p>
          {syncing && (
            <p className="mt-2 text-xs font-medium text-secondary-500">
              Đang đồng bộ kết quả từ cổng thanh toán...
            </p>
          )}

          {orderCode && (
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <span className="text-secondary-500">Mã đơn hàng: </span>
              <span className="font-mono font-semibold text-secondary-900">
                {orderCode}
              </span>
            </div>
          )}

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Button asChild>
              <Link to={orderId ? `/profile/orders/${orderId}` : "/profile/orders"}>
                <Package className="h-4 w-4" />
                Xem đơn hàng
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/products">
                <ShoppingBag className="h-4 w-4" />
                Mua tiếp
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">
                <Home className="h-4 w-4" />
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
