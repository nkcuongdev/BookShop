import { useEffect, useState } from "react";
import { Tag, Truck, ShieldCheck, Lock } from "lucide-react";
import { formatVND } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const SHIPPING_FREE_THRESHOLD = 200000;
const SHIPPING_FEE = 25000;

export default function OrderSummaryCard({
  subtotal = 0,
  itemCount = 0,
  shippingFee,
  onCheckout,
  checkoutLabel = "Tiến hành thanh toán",
  checkoutDisabled = false,
  showCheckoutButton = true,
  onCouponChange,
  onSummaryChange,
  compactItems = null,
  sticky = true,
  showCoupon = true,
  className,
}) {
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [applying, setApplying] = useState(false);

  const applyCoupon = (e) => {
    e?.preventDefault?.();
    if (!coupon.trim()) return;
    setApplying(true);
    setTimeout(() => {
      const code = coupon.trim().toUpperCase();
      if (code === "WELCOME10") {
        const d = Math.min(subtotal * 0.1, 50000);
        setDiscount(d);
        setAppliedCouponCode(code);
        toast.success("Áp dụng mã WELCOME10 — giảm 10%");
      } else {
        toast.error("Mã giảm giá không hợp lệ");
        setDiscount(0);
        setAppliedCouponCode("");
      }
      setApplying(false);
    }, 300);
  };

  const autoShipping =
    subtotal === 0
      ? 0
      : subtotal >= SHIPPING_FREE_THRESHOLD
        ? 0
        : SHIPPING_FEE;
  const shipping = typeof shippingFee === "number" ? shippingFee : autoShipping;

  const total = Math.max(0, subtotal + shipping - discount);

  useEffect(() => {
    onCouponChange?.(appliedCouponCode);
  }, [appliedCouponCode, onCouponChange]);

  useEffect(() => {
    onSummaryChange?.({ total, discount, shipping });
  }, [total, discount, shipping, onSummaryChange]);

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden",
        sticky && "lg:sticky lg:top-24",
        className
      )}
    >
      <div className="p-5">
        <h3 className="font-display font-bold text-lg text-secondary-800">
          Tóm tắt đơn hàng
        </h3>
        {itemCount > 0 && (
          <p className="text-xs text-secondary-500 mt-0.5">
            {itemCount} sản phẩm
          </p>
        )}

        {compactItems}

        {showCoupon && (
          <form onSubmit={applyCoupon} className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <Input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="Mã giảm giá"
                className="pl-9"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={!coupon.trim() || applying}
            >
              Áp dụng
            </Button>
          </form>
        )}

        <div className="mt-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-secondary-500">Tạm tính</span>
            <span className="font-medium text-secondary-800">
              {formatVND(subtotal)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-secondary-500 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Phí vận chuyển
            </span>
            <span className="font-medium text-secondary-800">
              {shipping === 0 ? (
                <span className="text-emerald-600">Miễn phí</span>
              ) : (
                formatVND(shipping)
              )}
            </span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">Giảm giá</span>
              <span className="font-medium text-red-500">
                -{formatVND(discount)}
              </span>
            </div>
          )}
          {subtotal > 0 && subtotal < SHIPPING_FREE_THRESHOLD && (
            <div className="text-xs bg-amber-50 text-amber-800 rounded-lg p-2">
              Mua thêm{" "}
              <span className="font-semibold">
                {formatVND(SHIPPING_FREE_THRESHOLD - subtotal)}
              </span>{" "}
              để được miễn phí vận chuyển
            </div>
          )}
        </div>

        <Separator className="my-4" />

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-secondary-600">
            Tổng cộng
          </span>
          <span className="text-2xl font-bold text-primary-600">
            {formatVND(total)}
          </span>
        </div>

        {showCheckoutButton && (
          <Button
            onClick={() => onCheckout?.({ total, discount, shipping })}
            disabled={checkoutDisabled || itemCount === 0}
            size="lg"
            className="w-full mt-4"
          >
            <Lock className="w-4 h-4" />
            {checkoutLabel}
          </Button>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-secondary-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Thanh toán an toàn & bảo mật
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          {["VISA", "MoMo", "COD", "Banking"].map((m) => (
            <span
              key={m}
              className="text-[10px] font-semibold text-secondary-500 bg-gray-50 border border-gray-100 px-2 py-1 rounded"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
