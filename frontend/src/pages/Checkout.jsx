import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Truck,
  CreditCard,
  MapPin,
  Lock,
  ArrowLeft,
  FileText,
  CircleAlert,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { useCart } from "@/context/CartContext.jsx";
import { useAuth } from "@/context/AuthContext.jsx";
import { authAPI, eventsAPI, ordersAPI } from "@/services/api";
import { formatDateVN, formatVND } from "@/utils/format";
import { formatFullAddress } from "@/utils/address";
import {
  clearBuyNowSelection,
  normalizeBuyNowSelection,
  readBuyNowSelection,
} from "@/utils/buyNow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import AddressForm from "@/components/checkout/AddressForm";
import PaymentMethods from "@/components/checkout/PaymentMethods";
import OrderSummaryCard from "@/components/cart/OrderSummaryCard";
import { Badge } from "@/components/ui/badge";
import BookCover from "@/components/book/BookCover";
import PageHeader from "@/components/common/PageHeader";
import StickyMobileBar from "@/components/common/StickyMobileBar";
import Stepper from "@/components/common/Stepper";
import SectionHeader from "@/components/common/SectionHeader";

const STEPS = [
  { key: "address", label: "Địa chỉ", sub: "Thông tin giao hàng" },
  { key: "shipping", label: "Vận chuyển", sub: "Chọn phương thức" },
  { key: "payment", label: "Thanh toán", sub: "Hoàn tất đơn" },
];

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Checkout() {
  const cart = useCart();
  const {
    totalPrice: cartTotalPrice,
    removePurchasedItems,
    loading: cartLoading,
  } = cart;
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // A "Mua ngay" checkout orders exactly one book and leaves the cart alone.
  // Router state is the fresh source; sessionStorage is the fallback so a
  // reload of /checkout does not silently switch over to the cart.
  const buyNow = useMemo(() => {
    const fromState = normalizeBuyNowSelection(location.state?.buyNow);
    return fromState || readBuyNowSelection();
  }, [location.state]);
  const items = useMemo(() => {
    // Keep compatibility with providers/mocks created before unavailable cart
    // lines were split from the checkout selection.
    const cartItems = cart.checkoutItems || cart.items || [];
    return buyNow ? [{ book: buyNow.book, quantity: buyNow.quantity }] : cartItems;
  }, [buyNow, cart.checkoutItems, cart.items]);
  const totalPrice = buyNow
    ? (Number(buyNow.book.price) || 0) * buyNow.quantity
    : cartTotalPrice;

  // Leaving checkout ends the buy-now session; otherwise a later visit to
  // /checkout from the cart would still be pinned to that single book.
  useEffect(() => () => clearBuyNowSelection(), []);

  const [step, setStep] = useState(1);
  const [address, setAddress] = useState({
    fullName: user?.name || "",
    phone: "",
    address: "",
    city: "",
    district: "",
    ward: "",
    note: "",
  });
  const [errors, setErrors] = useState({});
  const [shippingMethod, setShippingMethod] = useState("");
  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const selectedPaymentMethod = user && !user.emailVerified && paymentMethod === "COD"
    ? "VNPAY"
    : paymentMethod;
  const [verificationSending, setVerificationSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [appliedVoucherCodes, setAppliedVoucherCodes] = useState({
    orderVoucherCode: "",
    shippingVoucherCode: "",
  });
  const [summaryState, setSummaryState] = useState({
    total: totalPrice,
    discount: 0,
    shipping: 0,
    appliedPoints: 0,
    pointsDiscount: 0,
  });
  const trackedCheckoutStart = useRef(false);
  const orderIdempotencyKeyRef = useRef("");
  const shippingQuoteKey = [
    address.city,
    address.district,
    address.ward,
    address.address,
    ...items.map((item) => `${item.book._id || item.book.id}:${item.quantity}`),
  ].join("|");

  useEffect(() => {
    if (!user || items.length === 0 || trackedCheckoutStart.current) return;
    trackedCheckoutStart.current = true;
    eventsAPI.track({ type: "checkout_start" }).catch(() => null);
  }, [items.length, totalPrice, user]);

  const requestEmailVerification = async () => {
    setVerificationSending(true);
    try {
      const response = await authAPI.requestEmailVerification();
      toast.success(response.message || "Đã gửi email xác minh");
      if (response.data?.verificationUrl) {
        window.location.assign(response.data.verificationUrl);
      }
    } catch (error) {
      toast.error(error.message || "Không thể gửi email xác minh");
    } finally {
      setVerificationSending(false);
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    authAPI
      .getAddresses()
      .then((res) => {
        if (!active) return;
        const list = res?.data?.addresses || [];
        setSavedAddresses(list);

        const defaultAddr =
          list.find((addr) => addr?.isDefault) || list[0] || null;
        if (!defaultAddr) return;

        setSelectedSavedAddressId(defaultAddr._id || defaultAddr.id || "");
        setAddress((prev) => ({
          ...prev,
          fullName: defaultAddr.fullName || prev.fullName || "",
          phone: defaultAddr.phone || "",
          address: defaultAddr.address || "",
          city: defaultAddr.city || "",
          district: defaultAddr.district || "",
          ward: defaultAddr.ward || "",
        }));
      })
      .catch(() => {
        if (active) setSavedAddresses([]);
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (step < 2 || !user || items.length === 0) return undefined;
    let active = true;
    // A quote belongs to the exact address/cart snapshot. Invalidate it before
    // the debounce so a stale fee cannot be submitted while a new quote loads.
    setShippingLoading(true);
    setShippingOptions([]);
    setShippingMethod("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await ordersAPI.getShippingQuotes({
          items: items.map((item) => ({
            bookId: item.book._id || item.book.id,
            quantity: item.quantity,
          })),
          shippingAddress: {
            fullName: address.fullName.trim(),
            phone: address.phone.trim(),
            address: address.address.trim(),
            city: address.city?.trim() || "",
            district: address.district?.trim() || "",
            ward: address.ward?.trim() || "",
          },
        });
        if (!active) return;
        const options = response.data?.options || [];
        setShippingOptions(options);
        setShippingError("");
        setShippingMethod((current) =>
          options.some((option) => option.id === current)
            ? current
            : options[0]?.id || ""
        );
      } catch (error) {
        if (!active) return;
        setShippingOptions([]);
        setShippingMethod("");
        setShippingError(
          error?.message ||
            "Không thể kết nối GHN Sandbox. Vui lòng kiểm tra cấu hình thử nghiệm."
        );
      } finally {
        if (active) setShippingLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    address.address,
    address.city,
    address.district,
    address.fullName,
    address.phone,
    address.ward,
    items,
    shippingQuoteKey,
    step,
    user,
  ]);

  const selectedSavedAddress = useMemo(
    () =>
      savedAddresses.find((addr) => (addr._id || addr.id) === selectedSavedAddressId) || null,
    [savedAddresses, selectedSavedAddressId]
  );

  if (authLoading || (cartLoading && !buyNow)) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center text-muted-foreground"
        role="status"
      >
        Đang chuẩn bị thanh toán...
      </div>
    );
  }
  if (!user) return <Navigate to="/login?redirect=/checkout" replace />;
  if (items.length === 0) return <Navigate to="/cart" replace />;

  const handleSelectSavedAddress = (addr) => {
    setSelectedSavedAddressId(addr._id || addr.id || "");
    setAddress((prev) => ({
      ...prev,
      fullName: addr.fullName || "",
      phone: addr.phone || "",
      address: addr.address || "",
      city: addr.city || "",
      district: addr.district || "",
      ward: addr.ward || "",
    }));
    setErrors((prev) => ({
      ...prev,
      fullName: undefined,
      phone: undefined,
      address: undefined,
      city: undefined,
      district: undefined,
      ward: undefined,
    }));
  };

  const validateAddress = () => {
    const errs = {};
    if (!address.fullName.trim()) errs.fullName = "Vui lòng nhập họ tên";
    if (!address.phone.trim()) errs.phone = "Vui lòng nhập số điện thoại";
    else if (!/^[0-9]{10,11}$/.test(address.phone.replace(/\s/g, "")))
      errs.phone = "Số điện thoại không hợp lệ";
    if (!address.address.trim()) errs.address = "Vui lòng nhập địa chỉ";
    else if (
      address.address.trim().length <
      (address.city || address.district || address.ward ? 3 : 10)
    )
      errs.address = "Vui lòng nhập địa chỉ chi tiết hơn";
    // GHN only knows the three-level catalogue, so all three units are required
    // here — otherwise the shipping step silently returns no options.
    if (!address.city?.trim()) errs.city = "Vui lòng chọn tỉnh/thành phố";
    if (!address.district?.trim()) errs.district = "Vui lòng chọn quận/huyện";
    if (!address.ward?.trim()) errs.ward = "Vui lòng chọn phường/xã";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (step === 1 && !validateAddress()) return;
    setStep((s) => Math.min(s + 1, STEPS.length));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const backTarget = buyNow
    ? `/books/${buyNow.book._id || buyNow.book.id}`
    : "/cart";
  const goBack = () =>
    step > 1
      ? setStep((s) => s - 1)
      : navigate(backTarget);

  const handlePlaceOrder = async () => {
    if (!validateAddress()) {
      setStep(1);
      return;
    }
    const selectedOption = shippingOptions.find(
      (option) => option.id === shippingMethod
    );
    if (shippingLoading || !selectedOption) {
      setStep(2);
      toast.error("Vui lòng chọn lại phương thức vận chuyển");
      return;
    }
    setSubmitting(true);
    let redirectingToPayment = false;
    try {
      const orderItems = items.map((item) => ({
        bookId: item.book._id || item.book.id,
        quantity: item.quantity,
        expectedUnitPrice: Math.round(Number(item.book.price) || 0),
      }));
      const shippingAddress = {
        fullName: address.fullName.trim(),
        phone: address.phone.trim(),
        address: address.address.trim(),
        city: address.city?.trim() || "",
        district: address.district?.trim() || "",
        ward: address.ward?.trim() || "",
      };
      if (!orderIdempotencyKeyRef.current) {
        orderIdempotencyKeyRef.current = createIdempotencyKey();
      }
      const response = await ordersAPI.create(
        {
          items: orderItems,
          shippingAddress,
          paymentMethod: selectedPaymentMethod,
          orderVoucherCode:
            appliedVoucherCodes.orderVoucherCode || undefined,
          shippingVoucherCode:
            appliedVoucherCodes.shippingVoucherCode || undefined,
          shippingMethod:
            shippingOptions.find((option) => option.id === shippingMethod)
              ?.method || "standard",
          shippingOptionId: shippingMethod,
          note: address.note?.trim() || "",
          // Points, not money: the server holds the conversion rate and
          // re-checks the ceiling, so handing it an amount would let the client
          // decide what a point is worth.
          pointsToRedeem: summaryState.appliedPoints || undefined,
          checkoutSource: buyNow ? "BUY_NOW" : "CART",
          expectedTotal: Math.round(Number(summaryState.total) || 0),
          sessionId: eventsAPI.getSessionId(),
        },
        orderIdempotencyKeyRef.current
      );
      if (response.success) {
        orderIdempotencyKeyRef.current = "";
        const newId = response.data.order._id || response.data.order.id;
        const paymentUrl = response.data.paymentUrl;
        if (paymentUrl) {
          redirectingToPayment = true;
          toast.info("Đang chuyển sang cổng thanh toán...");
          window.location.href = paymentUrl;
          return;
        }
        // Buy-now items were never in the cart, so there is nothing to remove.
        if (!buyNow) {
          removePurchasedItems(response.data.order.items || []);
        }
        clearBuyNowSelection();
        toast.success("Đặt hàng thành công!");
        navigate(`/profile/orders/${newId}`, { state: { justCreated: true } });
      }
    } catch (e) {
      toast.error(e?.message || "Đặt hàng thất bại, thử lại sau");
    } finally {
      if (!redirectingToPayment) {
        setSubmitting(false);
      }
    }
  };

  const selectedShippingOption =
    shippingOptions.find((option) => option.id === shippingMethod);
  const shippingReady =
    !shippingLoading && Boolean(selectedShippingOption) && Boolean(shippingMethod);
  const shippingFee = selectedShippingOption?.fee || 0;

  return (
    <div className="min-h-screen pb-28 lg:pb-6">
      {/* Header */}
      <PageHeader
        crumbs={[
          buyNow
            ? { label: buyNow.book.title || "Sản phẩm", to: backTarget }
            : { label: "Giỏ hàng", to: "/cart" },
          { label: "Thanh toán" },
        ]}
        title="Thanh toán"
      >
        <div className="mt-5">
          <Stepper steps={STEPS} currentStep={step} />
        </div>
      </PageHeader>

      <div className="page-container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form steps */}
          <div className="lg:col-span-2 space-y-5">
            {step === 1 && (
              <Card className="p-5 lg:p-6">
                <SectionHeader
                  variant="icon"
                  icon={MapPin}
                  title="Địa chỉ giao hàng"
                  className="mb-4"
                />
                {savedAddresses.length > 0 && (
                  <div className="mb-4 rounded-xl border border-border p-3">
                    <p className="text-sm font-semibold text-foreground mb-2">
                      Chọn nhanh từ địa chỉ đã lưu
                    </p>
                    <div className="space-y-2">
                      {savedAddresses.map((addr) => {
                        const active =
                          (selectedSavedAddress?._id || selectedSavedAddress?.id) ===
                          (addr._id || addr.id);
                        return (
                          <button
                            key={addr._id || addr.id}
                            type="button"
                            onClick={() => handleSelectSavedAddress(addr)}
                            className={
                              "w-full text-left rounded-lg border p-3 transition-colors " +
                              (active
                                ? "border-primary-500 bg-primary-50/40"
                                : "border-border hover:border-primary-300")
                            }
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {addr.fullName}
                              </p>
                              <Badge variant="secondary">{addr.label || "Địa chỉ"}</Badge>
                              {addr.isDefault && <Badge variant="success">Mặc định</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{addr.phone}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {formatFullAddress(addr)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <AddressForm
                  key={selectedSavedAddressId || "custom-address"}
                  data={address}
                  onChange={setAddress}
                  errors={errors}
                />
              </Card>
            )}

            {step === 2 && (
              <Card className="p-5 lg:p-6">
                <SectionHeader
                  variant="icon"
                  icon={Truck}
                  title="Phương thức vận chuyển"
                  className="mb-4"
                />
                <RadioGroup
                  value={shippingMethod}
                  onValueChange={setShippingMethod}
                  className="gap-3"
                >
                  {shippingLoading && (
                    <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info-muted p-3 text-sm text-info-strong">
                      <Loader2 className="size-4 animate-spin" />
                      Đang lấy phí và thời gian giao hàng...
                    </div>
                  )}
                  {shippingError && (
                    <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-muted p-3 text-xs text-warning-strong">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" />
                      {shippingError}
                    </div>
                  )}
                  {shippingOptions.map((opt) => {
                    const active = shippingMethod === opt.id;
                    return (
                      <Label
                        key={opt.id}
                        htmlFor={`ship-${opt.id}`}
                        className={
                          "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all " +
                          (active
                            ? "border-primary-500 bg-primary-50/40"
                            : "border-border hover:border-primary-300 bg-card")
                        }
                      >
                        <RadioGroupItem
                          id={`ship-${opt.id}`}
                          value={opt.id}
                          className="mt-1"
                        />
                        <Truck className="size-5 text-primary mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="font-semibold text-foreground text-sm">
                            {opt.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {opt.description}
                          </p>
                          {opt.estimatedDelivery && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                              <CalendarDays className="size-3.5" />
                              Dự kiến giao {formatDateVN(opt.estimatedDelivery)}
                            </p>
                          )}
                        </div>
                        <p className="font-bold text-primary text-sm shrink-0">
                          {opt.fee === 0 ? "Miễn phí" : formatVND(opt.fee)}
                        </p>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </Card>
            )}

            {step === 3 && (
              <>
                <Card className="p-5 lg:p-6">
                  <SectionHeader
                    variant="icon"
                    icon={CreditCard}
                    title="Phương thức thanh toán"
                    className="mb-4"
                  />
                  <PaymentMethods
                    value={selectedPaymentMethod}
                    onChange={setPaymentMethod}
                    codDisabled={!user?.emailVerified}
                    codDisabledReason="Bạn cần xác minh email trước khi chọn thanh toán COD."
                    onRequestVerification={requestEmailVerification}
                    verificationSending={verificationSending}
                  />
                </Card>

                {/* Review summary */}
                <Card className="p-5 lg:p-6">
                  <SectionHeader
                    variant="icon"
                    icon={FileText}
                    title="Xác nhận đơn hàng"
                    className="mb-4"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/70 font-semibold mb-1">
                        Giao đến
                      </p>
                      <p className="font-medium text-foreground">
                        {address.fullName}
                      </p>
                      <p className="text-muted-foreground">{address.phone}</p>
                      <p className="text-muted-foreground mt-1">
                        {formatFullAddress(address)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/70 font-semibold mb-1">
                        Vận chuyển
                      </p>
                      <p className="font-medium text-foreground">
                        {selectedShippingOption?.title}
                      </p>
                      {selectedShippingOption?.estimatedDelivery && (
                        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="size-3.5" />
                          Dự kiến giao{" "}
                          {formatDateVN(selectedShippingOption.estimatedDelivery)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* Step nav (desktop) */}
            <div className="hidden lg:flex items-center justify-between gap-3">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" />
                {step === 1
                  ? buyNow
                    ? "Quay lại sản phẩm"
                    : "Quay lại giỏ"
                  : "Quay lại"}
              </Button>
              {step < STEPS.length && <Button onClick={goNext}>Tiếp tục</Button>}
            </div>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <OrderSummaryCard
              subtotal={totalPrice}
              itemCount={items.length}
              shippingFee={shippingReady ? shippingFee : undefined}
              onCheckout={step === STEPS.length ? handlePlaceOrder : goNext}
              checkoutLabel={
                step < STEPS.length ? "Tiếp tục" : "Đặt hàng ngay"
              }
              checkoutDisabled={
                submitting || !shippingReady
              }
              showCheckoutButton={step === STEPS.length}
              showCoupon={step === STEPS.length}
              showPoints={step === STEPS.length}
              voucherValidationReady={shippingReady}
              onCouponChange={setAppliedVoucherCodes}
              onSummaryChange={setSummaryState}
              compactItems={
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.book._id || item.book.id}
                      className="flex items-center gap-3"
                    >
                      <div className="relative shrink-0">
                        <BookCover
                          src={item.book.imageUrl}
                          title={item.book.title}
                          size="sm"
                        />
                        <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground line-clamp-2">
                          {item.book.title}
                        </p>
                        <p className="text-xs text-primary font-semibold mt-0.5">
                          {formatVND(item.book.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              }
            />
          </div>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      <StickyMobileBar>
        <Button variant="outline" onClick={goBack} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>
        {step < STEPS.length ? (
          <Button onClick={goNext} className="flex-1">
            Tiếp tục
          </Button>
        ) : (
          // !shippingReady is a validity guard, not progress — it belongs in
          // `disabled`, otherwise the button spins before a shipping method is
          // even picked.
          <Button
            onClick={handlePlaceOrder}
            disabled={!shippingReady}
            loading={submitting}
            loadingText="Đang xử lý..."
            className="flex-1"
          >
            <Lock className="size-4" />
            {`Đặt hàng · ${formatVND(summaryState.total)}`}
          </Button>
        )}
      </StickyMobileBar>
    </div>
  );
}
