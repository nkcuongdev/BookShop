import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
  Tag,
  TicketPercent,
  Truck,
  X,
} from "lucide-react";
import { formatVND } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { vouchersAPI } from "@/services/api";
import VoucherPickerDialog from "./VoucherPickerDialog";
import { usePointsCheckoutContext } from "@/features/loyalty/hooks";
import { POINT_VALUE_VND, computeMaxRedeemablePoints } from "@/utils/loyalty";

const VOUCHER_STORAGE_KEYS = {
  order: "bookshop_applied_voucher",
  shipping: "bookshop_applied_shipping_voucher",
};

function readStoredVoucherCodes() {
  try {
    return {
      order: window.sessionStorage.getItem(VOUCHER_STORAGE_KEYS.order) || "",
      shipping:
        window.sessionStorage.getItem(VOUCHER_STORAGE_KEYS.shipping) || "",
    };
  } catch {
    return { order: "", shipping: "" };
  }
}

function storeVoucherCode(scope, code) {
  try {
    const key = VOUCHER_STORAGE_KEYS[scope];
    if (code) window.sessionStorage.setItem(key, code);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Persistence is only a convenience; server validation is authoritative.
  }
}

const POINTS_STORAGE_KEY = "bookshop_applied_points";

function readStoredPoints() {
  try {
    const raw = Number(window.sessionStorage.getItem(POINTS_STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}

function storePoints(points) {
  try {
    if (points > 0)
      window.sessionStorage.setItem(POINTS_STORAGE_KEY, String(points));
    else window.sessionStorage.removeItem(POINTS_STORAGE_KEY);
  } catch {
    // Persistence is only a convenience; server validation is authoritative.
  }
}

const emptyVoucher = () => ({ code: "", discount: 0 });

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
  // Off by default so the cart page, which shares this component, is unchanged.
  showPoints = false,
  voucherValidationReady = true,
  className,
}) {
  const [storedCodes] = useState(readStoredVoucherCodes);
  const [coupon, setCoupon] = useState("");
  const [appliedVouchers, setAppliedVouchers] = useState({
    order: { code: storedCodes.order, discount: 0 },
    shipping: { code: storedCodes.shipping, discount: 0 },
  });
  // pointsInput is the customer's intent; pointsDraft is what they are still
  // typing. Mirrors the way `coupon` is kept apart from `appliedVouchers`.
  const [pointsInput, setPointsInput] = useState(readStoredPoints);
  const [pointsDraft, setPointsDraft] = useState("");
  const [applying, setApplying] = useState(false);
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  const applyRequestIdRef = useRef(0);
  const lastValidatedRef = useRef({
    order: { code: "", subtotal: null, shipping: null },
    shipping: { code: "", subtotal: null, shipping: null },
  });

  const shippingKnown = typeof shippingFee === "number";
  const shipping = shippingKnown ? shippingFee : 0;
  const validationShippingFee = shippingKnown ? shipping : undefined;
  const orderDiscount = appliedVouchers.order.discount;
  const shippingDiscount = appliedVouchers.shipping.discount;

  const { data: loyalty } = usePointsCheckoutContext({ enabled: showPoints });
  const pointsBalance = Number(loyalty?.balance) || 0;
  const pointsProgram = loyalty?.program;
  const pointsRate = Number(pointsProgram?.redeemRate) || POINT_VALUE_VND;
  const pointsEnabled = Boolean(
    showPoints &&
      pointsProgram?.enabled &&
      pointsProgram?.redeemEnabled &&
      pointsBalance > 0
  );

  // The cap is measured against the goods total after the order voucher, so a
  // voucher and points cannot together discount more than intended.
  const redeemableBase = Math.max(0, subtotal - orderDiscount);
  const maxRedeemablePoints = pointsEnabled
    ? computeMaxRedeemablePoints({
        balance: pointsBalance,
        eligibleAmount: redeemableBase,
        maxPercent: Number(pointsProgram?.redeemMaxPercent) || 0,
        rate: pointsRate,
        step: Number(pointsProgram?.redeemStep) || 1,
        minPoints: Number(pointsProgram?.redeemMinPoints) || 0,
      })
    : 0;

  // Derived, never stored. That is what makes re-clamping automatic when the
  // basket moves: no effect has to chase the change, and the customer's stated
  // intent survives a voucher that temporarily narrows the ceiling.
  const appliedPoints = pointsEnabled
    ? Math.max(0, Math.min(pointsInput, maxRedeemablePoints))
    : 0;
  const pointsDiscount = appliedPoints * pointsRate;
  const pointsClamped = pointsEnabled && pointsInput > maxRedeemablePoints;

  const discount = orderDiscount + shippingDiscount + pointsDiscount;
  const total = Math.max(0, subtotal + shipping - discount);

  const commitPoints = (next) => {
    const value = Math.max(0, Math.floor(Number(next) || 0));
    setPointsInput(value);
    setPointsDraft("");
    storePoints(value);
  };

  const applyPointsDraft = (event) => {
    event.preventDefault();
    commitPoints(pointsDraft);
  };

  const applyCouponCode = async (rawCode) => {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!code) return false;
    const requestId = ++applyRequestIdRef.current;
    setApplying(true);
    try {
      const response = await vouchersAPI.validate(
        code,
        subtotal,
        validationShippingFee
      );
      if (requestId !== applyRequestIdRef.current) return false;
      const resolvedCode = String(
        response?.data?.voucher?.code || code
      ).toUpperCase();
      const scope =
        response?.data?.voucher?.scope === "shipping" ? "shipping" : "order";
      const otherScope = scope === "order" ? "shipping" : "order";
      const resolvedVoucher = {
        code: resolvedCode,
        discount: Number(response?.data?.discountAmount || 0),
      };

      lastValidatedRef.current[scope] = {
        code: resolvedCode,
        subtotal,
        shipping: validationShippingFee ?? null,
      };
      setAppliedVouchers((current) => ({
        ...current,
        [scope]: resolvedVoucher,
        ...(current[otherScope].code === resolvedCode
          ? { [otherScope]: emptyVoucher() }
          : {}),
      }));
      storeVoucherCode(scope, resolvedCode);
      if (appliedVouchers[otherScope].code === resolvedCode) {
        storeVoucherCode(otherScope, "");
      }
      setCoupon("");
      toast.success(`Áp dụng mã ${resolvedCode} thành công`);
      return true;
    } catch (error) {
      if (requestId !== applyRequestIdRef.current) return false;
      toast.error(error.message || "Mã giảm giá không hợp lệ");
      return false;
    } finally {
      if (requestId === applyRequestIdRef.current) setApplying(false);
    }
  };

  const applyCoupon = (event) => {
    event.preventDefault();
    applyCouponCode(coupon);
  };

  const selectVoucher = async (code) => {
    const applied = await applyCouponCode(code);
    if (applied) setVoucherPickerOpen(false);
  };

  const removeCoupon = (scope) => {
    applyRequestIdRef.current += 1;
    lastValidatedRef.current[scope] = {
      code: "",
      subtotal: null,
      shipping: null,
    };
    setApplying(false);
    setAppliedVouchers((current) => ({ ...current, [scope]: emptyVoucher() }));
    storeVoucherCode(scope, "");
  };

  useEffect(() => {
    onCouponChange?.({
      orderVoucherCode: appliedVouchers.order.code,
      shippingVoucherCode: appliedVouchers.shipping.code,
    });
  }, [appliedVouchers.order.code, appliedVouchers.shipping.code, onCouponChange]);

  useEffect(() => {
    if (!voucherValidationReady) return undefined;
    const entries = Object.entries(appliedVouchers).filter(
      ([, voucher]) => voucher.code
    );
    if (entries.length === 0) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const [storedScope, applied] of entries) {
        const last = lastValidatedRef.current[storedScope];
        if (
          last.code === applied.code &&
          last.subtotal === subtotal &&
          last.shipping === (validationShippingFee ?? null)
        ) {
          continue;
        }
        try {
          const response = await vouchersAPI.validate(
            applied.code,
            subtotal,
            validationShippingFee
          );
          if (cancelled) return;
          const resolvedScope =
            response?.data?.voucher?.scope === "shipping" ? "shipping" : "order";
          const resolvedCode = String(
            response?.data?.voucher?.code || applied.code
          ).toUpperCase();
          lastValidatedRef.current[resolvedScope] = {
            code: resolvedCode,
            subtotal,
            shipping: validationShippingFee ?? null,
          };
          setAppliedVouchers((current) => ({
            ...current,
            ...(storedScope !== resolvedScope
              ? { [storedScope]: emptyVoucher() }
              : {}),
            [resolvedScope]: {
              code: resolvedCode,
              discount: Number(response?.data?.discountAmount || 0),
            },
          }));
          storeVoucherCode(
            storedScope,
            storedScope === resolvedScope ? resolvedCode : ""
          );
          storeVoucherCode(resolvedScope, resolvedCode);
        } catch {
          if (cancelled) return;
          lastValidatedRef.current[storedScope] = {
            code: "",
            subtotal: null,
            shipping: null,
          };
          storeVoucherCode(storedScope, "");
          setAppliedVouchers((current) => ({
            ...current,
            [storedScope]: emptyVoucher(),
          }));
          toast.error(
            storedScope === "shipping" && validationShippingFee === 0
              ? "Đơn hàng đã được miễn phí vận chuyển"
              : `Voucher ${applied.code} không còn phù hợp`
          );
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    appliedVouchers,
    subtotal,
    validationShippingFee,
    voucherValidationReady,
  ]);

  useEffect(() => {
    onSummaryChange?.({
      total,
      discount,
      orderDiscount,
      shippingDiscount,
      pointsDiscount,
      appliedPoints,
      shipping,
    });
  }, [
    appliedPoints,
    discount,
    onSummaryChange,
    orderDiscount,
    pointsDiscount,
    shipping,
    shippingDiscount,
    total,
  ]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-card shadow-rest ring-1 ring-foreground/[0.06]",
        sticky && "lg:sticky lg:top-24",
        className
      )}
    >
      <div className="p-5">
        <h3 className="font-display text-h3 font-bold text-foreground">
          Tóm tắt đơn hàng
        </h3>
        {itemCount > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {itemCount} sản phẩm
          </p>
        )}

        {compactItems}

        {showCoupon && (
          <div className="mt-4">
            <form onSubmit={applyCoupon} className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={coupon}
                  onChange={(event) => setCoupon(event.target.value)}
                  placeholder="Mã giảm giá"
                  className="pl-9"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={!coupon.trim() || applying}
                loading={applying}
              >
                {applying ? "Đang áp dụng..." : "Áp dụng"}
              </Button>
            </form>

            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 px-2 text-primary"
                disabled={subtotal <= 0}
                onClick={() => setVoucherPickerOpen(true)}
              >
                <TicketPercent className="size-4" />
                Chọn voucher
              </Button>
            </div>

            <div className="mt-2 space-y-1.5">
              {Object.entries(appliedVouchers).map(([scope, voucher]) =>
                voucher.code ? (
                  <div
                    key={scope}
                    className="flex items-center gap-1.5 text-xs text-success-strong"
                  >
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span className="font-semibold">
                      {scope === "shipping" ? "Phí ship" : "Đơn hàng"}: {voucher.code}
                      {scope === "shipping" && !shippingKnown
                        ? " (chờ địa chỉ)"
                        : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCoupon(scope)}
                      className="rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                      aria-label={`Bỏ voucher ${voucher.code}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : null
              )}
            </div>

            <VoucherPickerDialog
              open={voucherPickerOpen}
              onOpenChange={setVoucherPickerOpen}
              subtotal={subtotal}
              shippingFee={shippingKnown ? shipping : null}
              selectedCodes={{
                order: appliedVouchers.order.code,
                shipping: appliedVouchers.shipping.code,
              }}
              onSelect={selectVoucher}
              selecting={applying}
            />
          </div>
        )}

        {pointsEnabled && (
          <div className="mt-4">
            <Separator className="mb-4" />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="size-4 text-warning-strong" />
                Dùng điểm thưởng
              </span>
              <span className="text-xs text-muted-foreground">
                Bạn có {pointsBalance.toLocaleString("vi-VN")} điểm
              </span>
            </div>

            {maxRedeemablePoints > 0 ? (
              <>
                <form onSubmit={applyPointsDraft} className="mt-2 flex gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={pointsDraft}
                    onChange={(e) => setPointsDraft(e.target.value)}
                    placeholder={`Tối đa ${maxRedeemablePoints}`}
                    aria-label="Số điểm muốn dùng"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    aria-label="Áp dụng điểm thưởng"
                  >
                    Áp dụng
                  </Button>
                </form>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-auto px-1 py-1 text-xs"
                  onClick={() => commitPoints(maxRedeemablePoints)}
                >
                  Dùng tối đa {maxRedeemablePoints} điểm
                </Button>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Đơn hàng này chưa đủ điều kiện dùng điểm.
              </p>
            )}

            {appliedPoints > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-success-strong">
                <CheckCircle2 className="size-3.5" />
                <span>
                  Đang dùng {appliedPoints} điểm (−{formatVND(pointsDiscount)})
                </span>
                <button
                  type="button"
                  onClick={() => commitPoints(0)}
                  aria-label="Bỏ dùng điểm"
                  className="ml-auto rounded p-0.5 hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            {pointsClamped && (
              <p className="mt-2 text-xs text-warning-strong">
                Chỉ áp dụng được {maxRedeemablePoints} điểm cho đơn này (tối đa{" "}
                {pointsProgram?.redeemMaxPercent}% tiền hàng).
              </p>
            )}
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          <SummaryRow label="Tạm tính" value={formatVND(subtotal)} />
          <SummaryRow
            label={
              <span className="flex items-center gap-1.5">
                <Truck className="size-4" />
                Phí vận chuyển
              </span>
            }
            value={
              !shippingKnown ? (
                <span className="text-muted-foreground">
                  Tính khi nhập địa chỉ
                </span>
              ) : shipping === 0 ? (
                <span className="text-success-strong">Miễn phí</span>
              ) : (
                formatVND(shipping)
              )
            }
          />
          {orderDiscount > 0 && (
            <DiscountRow label="Giảm giá đơn hàng" amount={orderDiscount} />
          )}
          {shippingDiscount > 0 && (
            <DiscountRow label="Giảm phí vận chuyển" amount={shippingDiscount} />
          )}
          {pointsDiscount > 0 && (
            <DiscountRow
              label={`Điểm thưởng (${appliedPoints} điểm)`}
              amount={pointsDiscount}
            />
          )}
        </div>

        <Separator className="my-4" />

        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Tổng cộng
          </span>
          <span className="text-2xl font-bold text-primary">{formatVND(total)}</span>
        </div>

        {showCheckoutButton && (
          <Button
            onClick={() =>
              onCheckout?.({
                total,
                discount,
                orderDiscount,
                shippingDiscount,
                pointsDiscount,
                appliedPoints,
                shipping,
              })
            }
            disabled={checkoutDisabled || itemCount === 0}
            size="lg"
            className="mt-4 w-full"
          >
            <Lock className="size-4" />
            {checkoutLabel}
          </Button>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
          <ShieldCheck className="size-4 text-success-strong" />
          Thanh toán an toàn và bảo mật
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          {["VISA", "MoMo", "COD", "Banking"].map((method) => (
            <span
              key={method}
              className="rounded border border-border bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"
            >
              {method}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function DiscountRow({ label, amount }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-danger-strong">-{formatVND(amount)}</span>
    </div>
  );
}
