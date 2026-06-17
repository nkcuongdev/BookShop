import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Copy, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/common/EmptyState";
import OrderStatusBadge from "@/components/order/OrderStatusBadge";
import OrderTimeline from "@/components/order/OrderTimeline";
import OrderPaymentCard from "@/components/order/OrderPaymentCard";
import OrderShippingCard from "@/components/order/OrderShippingCard";
import OrderPriceBreakdown from "@/components/order/OrderPriceBreakdown";
import OrderItemsList from "@/components/order/OrderItemsList";
import OrderActions from "@/components/order/OrderActions";
import { ordersAPI } from "@/services/api";
import { formatDateTimeVN, formatOrderCode } from "@/utils/format.js";

function OrderDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const justCreated = location.state?.justCreated;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await ordersAPI.getById(orderId);
      if (res.success) {
        setOrder(res.data.order);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      if (/404|not found|không tìm thấy/i.test(err.message)) {
        setNotFound(true);
      } else {
        toast.error(err.message || "Không tải được đơn hàng");
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopyCode = () => {
    const code = formatOrderCode(order);
    if (!code) return;
    navigator.clipboard?.writeText(code);
    toast.success("Đã sao chép mã đơn hàng");
  };

  if (loading) return <OrderDetailSkeleton />;

  if (notFound || !order) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={Package}
          title="Không tìm thấy đơn hàng"
          description="Đơn hàng này không tồn tại hoặc bạn không có quyền truy cập."
          action={
            <Button variant="outline" onClick={() => navigate("/profile/orders")}>
              <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
            </Button>
          }
        />
      </Card>
    );
  }

  const orderCode = formatOrderCode(order);

  return (
    <div className="space-y-4">
      {justCreated && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">
              Đặt hàng thành công!
            </p>
            <p className="text-sm text-emerald-700">
              {order.payment?.method === "COD"
                ? "Chúng tôi sẽ liên hệ để xác nhận đơn hàng trong thời gian sớm nhất."
                : "Vui lòng hoàn tất thanh toán để đơn hàng được xử lý."}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/profile/orders")}
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-secondary-800 truncate">
                Đơn hàng {orderCode}
              </h1>
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-secondary-400 hover:text-primary-600 transition-colors"
                aria-label="Sao chép mã đơn"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-secondary-500 mt-1">
              Đặt lúc {formatDateTimeVN(order.placedAt || order.createdAt)}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <OrderStatusBadge status={order.status} />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <OrderActions order={order} onChanged={load} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-secondary-800 text-sm mb-4">
              Tiến trình đơn hàng
            </h3>
            <OrderTimeline order={order} />
          </Card>

          <OrderItemsList items={order.items || []} />
        </div>

        <div className="space-y-4">
          <OrderShippingCard
            shippingAddress={order.shippingAddress}
            trackingNumber={order.trackingNumber}
            carrier={order.carrier}
            estimatedDelivery={order.estimatedDelivery}
            trackingEvents={order.trackingEvents}
            note={order.note}
          />
          <OrderPaymentCard payment={order.payment} />
          <OrderPriceBreakdown order={order} />
        </div>
      </div>

      <div className="text-center py-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/products">Tiếp tục mua sắm</Link>
        </Button>
      </div>
    </div>
  );
}
