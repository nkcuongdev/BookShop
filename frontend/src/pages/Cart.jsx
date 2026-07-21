import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { useCart } from "@/context/CartContext.jsx";
import { useAuth } from "@/context/AuthContext.jsx";
import CartItem from "@/components/cart/CartItem";
import OrderSummaryCard from "@/components/cart/OrderSummaryCard";
import EmptyState from "@/components/common/EmptyState";
import TrustBadgeRow from "@/components/common/TrustBadgeRow";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useConfirm } from "@/hooks/useConfirm";
import PageHeader from "@/components/common/PageHeader";

import { EmptyCartIllustration } from "@/components/common/illustrations";
export default function Cart() {
  const confirm = useConfirm();
  const {
    items,
    checkoutItems,
    cartNotices,
    removeItem,
    updateQuantity,
    totalPrice,
    totalItems,
    clearCart,
    loading,
    syncError,
    clearSyncError,
  } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!syncError) return;
    toast.error(syncError);
    clearSyncError();
  }, [syncError, clearSyncError]);

  const handleCheckout = () => {
    if (!checkoutItems.length) {
      toast.error("Giỏ hàng chưa có sản phẩm khả dụng để thanh toán");
      return;
    }
    if (!user) {
      toast.error("Vui lòng đăng nhập để thanh toán");
      navigate("/login?redirect=/checkout");
      return;
    }
    navigate("/checkout");
  };

  if (loading) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center text-muted-foreground"
        role="status"
      >
        Đang đồng bộ giỏ hàng...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 section-base">
        <EmptyState
          illustration={EmptyCartIllustration}
          title="Giỏ hàng trống"
          description="Bạn chưa thêm sách nào vào giỏ. Khám phá ngay để tìm cuốn sách yêu thích!"
          action={
            <Button asChild size="lg">
              <Link to="/products">
                Khám phá sách
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        crumbs={[{ label: "Trang chủ", to: "/" }, { label: "Giỏ hàng" }]}
        title="Giỏ hàng"
        subtitle={`Bạn đang có ${totalItems} sản phẩm trong giỏ`}
      />

      <div className="page-container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            {cartNotices.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning-muted p-3 text-sm text-warning-strong">
                Giỏ hàng đã được cập nhật theo tình trạng bán và tồn kho mới nhất. Các dòng không khả dụng được giữ lại để bạn xem hoặc xóa.
              </div>
            )}
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium text-muted-foreground">
                {items.length} sản phẩm
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Xoá tất cả sản phẩm?",
                    description: "Toàn bộ sản phẩm trong giỏ hàng sẽ bị xoá.",
                    confirmText: "Xoá tất cả",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  clearCart();
                  toast.success("Đã xoá giỏ hàng");
                }}
                className="text-muted-foreground hover:text-danger-strong"
              >
                <Trash2 className="size-4" />
                Xóa tất cả
              </Button>
            </div>

            {items.map((item) => (
              <CartItem
                key={item.book._id || item.book.id}
                item={item}
                onUpdateQty={updateQuantity}
                onRemove={(id) => {
                  removeItem(id);
                  toast.success("Đã xóa khỏi giỏ");
                }}
              />
            ))}

            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/products">
                <ArrowLeft className="size-4" />
                Tiếp tục mua sắm
              </Link>
            </Button>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <OrderSummaryCard
              subtotal={totalPrice}
              itemCount={totalItems}
              onCheckout={handleCheckout}
            />
          </div>
        </div>

        <div className="mt-10">
          <TrustBadgeRow />
        </div>
      </div>
    </div>
  );
}
