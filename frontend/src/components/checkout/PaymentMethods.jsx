import { Banknote, QrCode, Smartphone } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const METHODS = [
  {
    value: "COD",
    icon: Banknote,
    title: "Thanh toán khi nhận hàng (COD)",
    desc: "Thanh toán bằng tiền mặt khi bạn nhận sách.",
  },
  {
    value: "VNPAY",
    icon: QrCode,
    title: "VNPay QR / thẻ ngân hàng",
    desc: "Quét QR, ATM nội địa hoặc thẻ qua cổng VNPay.",
  },
  {
    value: "MOMO",
    icon: Smartphone,
    title: "Ví MoMo",
    desc: "Thanh toán nhanh qua ví MoMo.",
  },
];

export default function PaymentMethods({
  value = "COD",
  onChange,
  codDisabled = false,
  codDisabledReason = "",
  onRequestVerification,
  verificationSending = false,
}) {
  const selectMethod = (method) => {
    if (method.disabled) return;
    onChange?.(method.value);
  };

  return (
    <RadioGroup value={value} onValueChange={onChange} className="gap-3">
      {METHODS.map((baseMethod) => {
        const m =
          baseMethod.value === "COD" && codDisabled
            ? { ...baseMethod, disabled: true, disabledReason: codDisabledReason }
            : baseMethod;
        const isActive = value === m.value;
        return (
          <Label
            key={m.value}
            htmlFor={`pm-${m.value}`}
            onClick={() => selectMethod(m)}
            className={cn(
              "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
              m.disabled && "opacity-50 cursor-not-allowed",
              isActive
                ? "border-primary-500 bg-primary-50/40 shadow-xs"
                : "border-border hover:border-primary-300 bg-card"
            )}
          >
            <RadioGroupItem
              id={`pm-${m.value}`}
              value={m.value}
              disabled={m.disabled}
              className="mt-1"
            />
            <div
              className={cn(
                "size-10 rounded-lg flex items-center justify-center shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <m.icon className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground text-sm">
                  {m.title}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
              {m.disabledReason && (
                <div className="mt-2 text-xs text-warning-strong">
                  <p>{m.disabledReason}</p>
                  {onRequestVerification && (
                    <button
                      type="button"
                      className="mt-1 font-semibold text-primary hover:underline disabled:opacity-50"
                      disabled={verificationSending}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRequestVerification();
                      }}
                    >
                      {verificationSending ? "Đang gửi..." : "Gửi lại email xác minh"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
