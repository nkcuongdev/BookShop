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

export default function PaymentMethods({ value = "COD", onChange }) {
  const selectMethod = (method) => {
    if (method.disabled) return;
    onChange?.(method.value);
  };

  return (
    <RadioGroup value={value} onValueChange={onChange} className="gap-3">
      {METHODS.map((m) => {
        const isActive = value === m.value;
        return (
          <Label
            key={m.value}
            htmlFor={`pm-${m.value}`}
            role="radio"
            tabIndex={m.disabled ? -1 : 0}
            aria-checked={isActive}
            onClick={() => selectMethod(m)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectMethod(m);
              }
            }}
            className={cn(
              "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
              m.disabled && "opacity-50 cursor-not-allowed",
              isActive
                ? "border-primary-500 bg-primary-50/40 shadow-sm"
                : "border-gray-200 hover:border-primary-300 bg-white"
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
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                isActive
                  ? "bg-primary-500 text-white"
                  : "bg-gray-100 text-secondary-500"
              )}
            >
              <m.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-secondary-800 text-sm">
                  {m.title}
                </p>
              </div>
              <p className="text-xs text-secondary-500 mt-0.5">{m.desc}</p>
            </div>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
