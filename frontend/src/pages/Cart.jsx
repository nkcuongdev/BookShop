import { Link, useNavigate } from "react-router-dom";
import { ShoppingCart, Trash2, ArrowLeft, ArrowRight } from "lucide-react";
import { useCart } from "@/context/CartContext.jsx";
import { useAuth } from "@/context/AuthContext.jsx";
import CartItem from "@/components/cart/CartItem";
import OrderSummaryCard from "@/components/cart/OrderSummaryCard";
import EmptyState from "@/components/common/EmptyState";
import TrustBadgeRow from "@/components/common/TrustBadgeRow";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function Cart() {
  const { items, removeItem, updateQuantity, totalPrice, totalItems, clearCart } =
    useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCheckout = () => {
    if (!user) {
      toast.error("Vui lòng đăng nhập để thanh toán");
      navigate("/login?redirect=/checkout");
      return;
    }
    navigate("/checkout");
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <EmptyState
          icon={ShoppingCart}
          title="Giỏ hàng trống"
          description="Bạn chưa thêm sách nào vào giỏ. Khám phá ngay để tìm cuốn sách yêu thích!"
          action={
            <Button asChild size="lg">
              <Link to="/products">
                Khám phá sách
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <Breadcrumb className="mb-2">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Trang chủ</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Giỏ hàng</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-secondary-800">
            Giỏ hàng
          </h1>
          <p className="text-sm text-secondary-500 mt-0.5">
            Bạn đang có {totalItems} sản phẩm trong giỏ
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium text-secondary-600">
                {items.length} sản phẩm
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Xóa tất cả sản phẩm trong giỏ?")) {
                    clearCart();
                    toast.success("Đã xóa giỏ hàng");
                  }
                }}
                className="text-secondary-500 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
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
                <ArrowLeft className="w-4 h-4" />
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
