import { useEffect, useState } from "react";
import { Tag, Truck, ShieldCheck, Lock } from "lucide-react";
import { formatVND } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { vouchersAPI } from "@/services/api";

const SHIPPING_FREE_THRESHOLD = 200000;
const SHIPPING_FEE = 25000;

export default function OrderSummaryCard({
  subtotal = 0,
  itemCount = 0,
  shippingFee,
  onCheckout,
  checkoutLabel = "Tien hanh thanh toan",
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

  const applyCoupon = async (e) => {
    e?.preventDefault?.();
    if (!coupon.trim()) return;
    setApplying(true);
    try {
      const code = coupon.trim().toUpperCase();
      const res = await vouchersAPI.validate(code, subtotal);
      const d = Number(res?.data?.discountAmount || 0);
      setDiscount(d);
      setAppliedCouponCode(code);
      toast.success(`Ap dung ma ${code} thanh cong`);
    } catch (error) {
      toast.error(error.message || "Ma giam gia khong hop le");
      setDiscount(0);
      setAppliedCouponCode("");
    } finally {
      setApplying(false);
    }
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
    if (!appliedCouponCode) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await vouchersAPI.validate(appliedCouponCode, subtotal);
        if (!cancelled) setDiscount(Number(res?.data?.discountAmount || 0));
      } catch {
        if (!cancelled) {
          setDiscount(0);
          setAppliedCouponCode("");
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [appliedCouponCode, subtotal]);

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
          Tom tat don hang
        </h3>
        {itemCount > 0 && (
          <p className="text-xs text-secondary-500 mt-0.5">
            {itemCount} san pham
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
                placeholder="Ma giam gia"
                className="pl-9"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={!coupon.trim() || applying}
            >
              {applying ? "Dang ap dung..." : "Ap dung"}
            </Button>
          </form>
        )}

        <div className="mt-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-secondary-500">Tam tinh</span>
            <span className="font-medium text-secondary-800">
              {formatVND(subtotal)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-secondary-500 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Phi van chuyen
            </span>
            <span className="font-medium text-secondary-800">
              {shipping === 0 ? (
                <span className="text-emerald-600">Mien phi</span>
              ) : (
                formatVND(shipping)
              )}
            </span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">Giam gia</span>
              <span className="font-medium text-red-500">
                -{formatVND(discount)}
              </span>
            </div>
          )}
          {subtotal > 0 && subtotal < SHIPPING_FREE_THRESHOLD && (
            <div className="text-xs bg-amber-50 text-amber-800 rounded-lg p-2">
              Mua them{" "}
              <span className="font-semibold">
                {formatVND(SHIPPING_FREE_THRESHOLD - subtotal)}
              </span>{" "}
              de duoc mien phi van chuyen
            </div>
          )}
        </div>

        <Separator className="my-4" />

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-secondary-600">
            Tong cong
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
          Thanh toan an toan va bao mat
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
