import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CreditCard, X, ShoppingCart, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CancelOrderDialog from "./CancelOrderDialog";
import { useCart } from "@/context/CartContext.jsx";
import { ordersAPI } from "@/services/api";

// Theo state machine backend: hủy được khi PENDING (user), PAID/PROCESSING (refund flow)
const CANCELLABLE_STATUSES = new Set(["PENDING", "PAID", "PROCESSING"]);
const REORDERABLE_STATUSES = new Set([
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
]);

export default function OrderActions({ order, onChanged }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const status = order.status;
  const isCOD = order.payment?.method === "COD";
  const isUnpaid = order.payment?.status === "UNPAID";
  const canPay = status === "PENDING" && !isCOD && isUnpaid;
  const canCancel = CANCELLABLE_STATUSES.has(status);
  const canReorder = REORDERABLE_STATUSES.has(status);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await ordersAPI.retryPayment(order._id || order.id);
      const url = res?.data?.paymentUrl;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("Không lấy được liên kết thanh toán");
    } catch (err) {
      toast.error(err.message || "Không thể thanh toán lúc này");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (reason) => {
    setLoading(true);
    try {
      const res = await ordersAPI.cancel(order._id || order.id, reason);
      if (res.success) {
        toast.success(res.message || "Đã huỷ đơn hàng");
        setCancelOpen(false);
        onChanged?.();
      }
    } catch (err) {
      toast.error(err.message || "Không thể huỷ đơn hàng");
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = () => {
    let added = 0;
    order.items?.forEach((item) => {
      const bookId = item.book?._id || item.book || item.bookId;
      if (!bookId) return;
      addItem(
        {
          _id: bookId,
          title: item.title,
          author: item.author,
          imageUrl: item.imageUrl,
          price: item.price,
        },
        item.quantity
      );
      added += 1;
    });
    if (added > 0) {
      toast.success(`Đã thêm ${added} sản phẩm vào giỏ hàng`);
      navigate("/cart");
    } else {
      toast.error("Không có sản phẩm để mua lại");
    }
  };

  if (!canPay && !canCancel && !canReorder) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canReorder && (
          <Button variant="outline" onClick={handleReorder}>
            <ShoppingCart className="w-4 h-4" />
            Mua lại
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => setCancelOpen(true)}
            disabled={loading}
          >
            <X className="w-4 h-4" />
            Huỷ đơn
          </Button>
        )}
        {canPay && (
          <Button onClick={handlePay} disabled={loading}>
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            Thanh toán ngay
          </Button>
        )}
      </div>

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
        loading={loading}
        description={
          status === "PENDING"
            ? "Đơn hàng sẽ được huỷ và trả lại tồn kho ngay."
            : "Đơn đã thanh toán sẽ chuyển sang trạng thái hoàn tiền. Thời gian hoàn có thể mất 3-7 ngày làm việc."
        }
      />
    </>
  );
}
