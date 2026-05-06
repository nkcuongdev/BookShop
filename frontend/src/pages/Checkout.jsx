import { useEffect, useMemo, useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import {
  Truck,
  CreditCard,
  MapPin,
  CheckCircle2,
  Lock,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { useCart } from "@/context/CartContext.jsx";
import { useAuth } from "@/context/AuthContext.jsx";
import { ordersAPI } from "@/services/api";
import { formatVND } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import CheckoutStepper from "@/components/checkout/CheckoutStepper";
import AddressForm from "@/components/checkout/AddressForm";
import PaymentMethods from "@/components/checkout/PaymentMethods";
import OrderSummaryCard from "@/components/cart/OrderSummaryCard";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { key: "address", label: "Địa chỉ", sub: "Thông tin giao hàng" },
  { key: "shipping", label: "Vận chuyển", sub: "Chọn phương thức" },
  { key: "payment", label: "Thanh toán", sub: "Hoàn tất đơn" },
];

const SHIPPING_OPTIONS = [
  {
    value: "standard",
    title: "Giao hàng tiêu chuẩn",
    desc: "Nhận hàng sau 2-4 ngày làm việc",
    fee: 0,
    icon: Truck,
  },
  {
    value: "express",
    title: "Giao nhanh 24h",
    desc: "Nhận hàng trong vòng 24h (nội thành)",
    fee: 25000,
    icon: Truck,
  },
];

const ADDRESS_STORAGE_KEY = "bookshop_addresses";

export default function Checkout() {
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [address, setAddress] = useState({
    fullName: user?.name || "",
    phone: "",
    address: "",
    note: "",
  });
  const [errors, setErrors] = useState({});
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [appliedVoucherCode, setAppliedVoucherCode] = useState("");
  const [summaryState, setSummaryState] = useState({
    total: totalPrice,
    discount: 0,
    shipping: 0,
  });

  if (items.length === 0) return <Navigate to="/cart" replace />;
  if (!user) return <Navigate to="/login?redirect=/checkout" replace />;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADDRESS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      setSavedAddresses(list);

      const defaultAddr =
        list.find((addr) => addr?.isDefault) || list[0] || null;
      if (!defaultAddr) return;

      setSelectedSavedAddressId(defaultAddr.id || "");
      setAddress((prev) => ({
        ...prev,
        fullName: defaultAddr.fullName || prev.fullName || "",
        phone: defaultAddr.phone || "",
        address: defaultAddr.address || "",
      }));
    } catch {
      setSavedAddresses([]);
    }
  }, []);

  const selectedSavedAddress = useMemo(
    () =>
      savedAddresses.find((addr) => addr.id === selectedSavedAddressId) || null,
    [savedAddresses, selectedSavedAddressId]
  );

  const handleSelectSavedAddress = (addr) => {
    setSelectedSavedAddressId(addr.id || "");
    setAddress((prev) => ({
      ...prev,
      fullName: addr.fullName || "",
      phone: addr.phone || "",
      address: addr.address || "",
    }));
    setErrors((prev) => ({
      ...prev,
      fullName: undefined,
      phone: undefined,
      address: undefined,
    }));
  };

  const validateAddress = () => {
    const errs = {};
    if (!address.fullName.trim()) errs.fullName = "Vui lòng nhập họ tên";
    if (!address.phone.trim()) errs.phone = "Vui lòng nhập số điện thoại";
    else if (!/^[0-9]{10,11}$/.test(address.phone.replace(/\s/g, "")))
      errs.phone = "Số điện thoại không hợp lệ";
    if (!address.address.trim()) errs.address = "Vui lòng nhập địa chỉ";
    else if (address.address.trim().length < 10)
      errs.address = "Vui lòng nhập địa chỉ chi tiết hơn";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (step === 1 && !validateAddress()) return;
    setStep((s) => Math.min(s + 1, STEPS.length));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () =>
    step > 1
      ? setStep((s) => s - 1)
      : navigate("/cart");

  const handlePlaceOrder = async () => {
    if (!validateAddress()) {
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const orderItems = items.map((item) => ({
        bookId: item.book._id || item.book.id,
        quantity: item.quantity,
      }));
      const shippingAddress = {
        fullName: address.fullName.trim(),
        phone: address.phone.trim(),
        address: address.address.trim(),
      };
      const fee =
        SHIPPING_OPTIONS.find((s) => s.value === shippingMethod)?.fee || 0;
      const response = await ordersAPI.create({
        items: orderItems,
        shippingAddress,
        paymentMethod,
        voucherCode: appliedVoucherCode || undefined,
        shippingFee: fee,
        note: address.note?.trim() || "",
      });
      if (response.success) {
        toast.success("Đặt hàng thành công!");
        clearCart();
        const newId = response.data.order._id || response.data.order.id;
        const paymentUrl = response.data.paymentUrl;
        if (paymentUrl) {
          window.location.href = paymentUrl;
          return;
        }
        navigate(`/profile/orders/${newId}`, { state: { justCreated: true } });
      }
    } catch (e) {
      toast.error(e?.message || "Đặt hàng thất bại, thử lại sau");
    } finally {
      setSubmitting(false);
    }
  };

  const shippingFee =
    SHIPPING_OPTIONS.find((s) => s.value === shippingMethod)?.fee || 0;

  return (
    <div className="min-h-screen pb-28 lg:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <Breadcrumb className="mb-2">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/cart">Giỏ hàng</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Thanh toán</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-secondary-800">
            Thanh toán
          </h1>
          <div className="mt-5">
            <CheckoutStepper steps={STEPS} currentStep={step} />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form steps */}
          <div className="lg:col-span-2 space-y-5">
            {step === 1 && (
              <Card className="p-5 lg:p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-display font-bold text-secondary-800">
                    Địa chỉ giao hàng
                  </h2>
                </div>
                {savedAddresses.length > 0 && (
                  <div className="mb-4 rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-secondary-800 mb-2">
                      Chọn nhanh từ địa chỉ đã lưu
                    </p>
                    <div className="space-y-2">
                      {savedAddresses.map((addr) => {
                        const active = selectedSavedAddress?.id === addr.id;
                        return (
                          <button
                            key={addr.id}
                            type="button"
                            onClick={() => handleSelectSavedAddress(addr)}
                            className={
                              "w-full text-left rounded-lg border p-3 transition-colors " +
                              (active
                                ? "border-primary-500 bg-primary-50/40"
                                : "border-gray-200 hover:border-primary-300")
                            }
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-secondary-800">
                                {addr.fullName}
                              </p>
                              <Badge variant="secondary">{addr.label || "Địa chỉ"}</Badge>
                              {addr.isDefault && <Badge variant="success">Mặc định</Badge>}
                            </div>
                            <p className="text-xs text-secondary-600 mt-1">{addr.phone}</p>
                            <p className="text-xs text-secondary-600 mt-0.5 line-clamp-2">
                              {addr.address}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <AddressForm
                  data={address}
                  onChange={setAddress}
                  errors={errors}
                />
              </Card>
            )}

            {step === 2 && (
              <Card className="p-5 lg:p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                    <Truck className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-display font-bold text-secondary-800">
                    Phương thức vận chuyển
                  </h2>
                </div>
                <RadioGroup
                  value={shippingMethod}
                  onValueChange={setShippingMethod}
                  className="gap-3"
                >
                  {SHIPPING_OPTIONS.map((opt) => {
                    const active = shippingMethod === opt.value;
                    return (
                      <Label
                        key={opt.value}
                        htmlFor={`ship-${opt.value}`}
                        className={
                          "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all " +
                          (active
                            ? "border-primary-500 bg-primary-50/40"
                            : "border-gray-200 hover:border-primary-300 bg-white")
                        }
                      >
                        <RadioGroupItem
                          id={`ship-${opt.value}`}
                          value={opt.value}
                          className="mt-1"
                        />
                        <opt.icon className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="font-semibold text-secondary-800 text-sm">
                            {opt.title}
                          </p>
                          <p className="text-xs text-secondary-500 mt-0.5">
                            {opt.desc}
                          </p>
                        </div>
                        <p className="font-bold text-primary-600 text-sm shrink-0">
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
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-display font-bold text-secondary-800">
                      Phương thức thanh toán
                    </h2>
                  </div>
                  <PaymentMethods
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                  />
                </Card>

                {/* Review summary */}
                <Card className="p-5 lg:p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-display font-bold text-secondary-800">
                      Xác nhận đơn hàng
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-secondary-400 font-semibold mb-1">
                        Giao đến
                      </p>
                      <p className="font-medium text-secondary-800">
                        {address.fullName}
                      </p>
                      <p className="text-secondary-600">{address.phone}</p>
                      <p className="text-secondary-600 mt-1">
                        {address.address}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-secondary-400 font-semibold mb-1">
                        Vận chuyển
                      </p>
                      <p className="font-medium text-secondary-800">
                        {SHIPPING_OPTIONS.find(
                          (s) => s.value === shippingMethod
                        )?.title}
                      </p>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* Step nav (desktop) */}
            <div className="hidden lg:flex items-center justify-between gap-3">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="w-4 h-4" />
                {step === 1 ? "Quay lại giỏ" : "Quay lại"}
              </Button>
              {step < STEPS.length && <Button onClick={goNext}>Tiếp tục</Button>}
            </div>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <OrderSummaryCard
              subtotal={totalPrice}
              itemCount={items.length}
              shippingFee={shippingFee}
              onCheckout={step === STEPS.length ? handlePlaceOrder : goNext}
              checkoutLabel={
                step < STEPS.length ? "Tiếp tục" : "Đặt hàng ngay"
              }
              checkoutDisabled={submitting}
              showCheckoutButton={step === STEPS.length}
              showCoupon={step === STEPS.length}
              onCouponChange={setAppliedVoucherCode}
              onSummaryChange={setSummaryState}
              compactItems={
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.book._id || item.book.id}
                      className="flex items-center gap-3"
                    >
                      <div className="relative shrink-0">
                        <img
                          src={item.book.imageUrl}
                          alt=""
                          className="w-12 h-16 object-cover rounded-lg bg-gray-100"
                        />
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-secondary-800 line-clamp-2">
                          {item.book.title}
                        </p>
                        <p className="text-xs text-primary-600 font-semibold mt-0.5">
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
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-2xl p-3 flex items-center gap-2">
        <Button variant="outline" onClick={goBack} className="shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        {step < STEPS.length ? (
          <Button onClick={goNext} className="flex-1">
            Tiếp tục
          </Button>
        ) : (
          <Button
            onClick={handlePlaceOrder}
            disabled={submitting}
            className="flex-1"
          >
            <Lock className="w-4 h-4" />
            {submitting
              ? "Đang xử lý..."
              : `Đặt hàng · ${formatVND(summaryState.total)}`}
          </Button>
        )}
      </div>
    </div>
  );
}
