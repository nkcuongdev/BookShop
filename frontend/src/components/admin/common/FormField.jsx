import { Controller, useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({ name, label, description, required, children, className }) {
  const { control, formState } = useFormContext();
  const error = name.split(".").reduce((o, k) => o?.[k], formState.errors);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={name} className="flex items-center gap-1">
          {label}
          {required && <span className="text-rose-500">*</span>}
        </Label>
      )}
      <Controller
        control={control}
        name={name}
        render={({ field }) => children({ ...field, id: name })}
      />
      {description && !error && (
        <p className="text-xs text-secondary-500">{description}</p>
      )}
      {error?.message && (
        <p className="text-xs text-rose-600">{String(error.message)}</p>
      )}
    </div>
  );
}
