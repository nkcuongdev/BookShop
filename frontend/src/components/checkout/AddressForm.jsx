import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Phone, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

function Field({ id, label, icon: Icon, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-secondary-400" />}
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function AddressForm({ data, onChange, errors = {} }) {
  const update = (k, v) => onChange?.({ ...data, [k]: v });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          id="fullName"
          label="Họ và tên"
          icon={User}
          error={errors.fullName}
        >
          <Input
            id="fullName"
            value={data.fullName || ""}
            onChange={(e) => update("fullName", e.target.value)}
            placeholder="Nguyễn Văn A"
            className={cn(errors.fullName && "border-red-500")}
          />
        </Field>
        <Field
          id="phone"
          label="Số điện thoại"
          icon={Phone}
          error={errors.phone}
        >
          <Input
            id="phone"
            value={data.phone || ""}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="0912 345 678"
            className={cn(errors.phone && "border-red-500")}
            inputMode="tel"
          />
        </Field>
      </div>
      <Field
        id="address"
        label="Địa chỉ giao hàng"
        icon={MapPin}
        error={errors.address}
      >
        <textarea
          id="address"
          value={data.address || ""}
          onChange={(e) => update("address", e.target.value)}
          rows={3}
          placeholder="Số nhà, đường, phường, quận, thành phố..."
          className={cn(
            "w-full rounded-xl border border-gray-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none",
            errors.address && "border-red-500"
          )}
        />
      </Field>
      <Field id="note" label="Ghi chú (không bắt buộc)">
        <textarea
          id="note"
          value={data.note || ""}
          onChange={(e) => update("note", e.target.value)}
          rows={2}
          placeholder="Ví dụ: Giao ngoài giờ hành chính..."
          className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
        />
      </Field>
    </div>
  );
}
