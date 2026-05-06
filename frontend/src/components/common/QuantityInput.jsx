import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function QuantityInput({
  value = 1,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  className,
}) {
  const sizes = {
    sm: { btn: "h-8 w-8", input: "h-8 w-12 text-sm" },
    md: { btn: "h-10 w-10", input: "h-10 w-14 text-base" },
    lg: { btn: "h-12 w-12", input: "h-12 w-16 text-lg" },
  };
  const cls = sizes[size] || sizes.md;

  const decrement = () => onChange?.(Math.max(min, value - 1));
  const increment = () => onChange?.(Math.min(max, value + 1));

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden",
        className
      )}
    >
      <button
        type="button"
        onClick={decrement}
        disabled={value <= min}
        className={cn(
          "flex items-center justify-center text-secondary-600 hover:bg-gray-50 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
          cls.btn
        )}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const num = parseInt(e.target.value.replace(/\D/g, ""), 10);
          if (!isNaN(num)) onChange?.(Math.min(max, Math.max(min, num)));
          else if (e.target.value === "") onChange?.(min);
        }}
        className={cn(
          "text-center font-semibold border-x border-gray-200 focus:outline-none focus:bg-gray-50",
          cls.input
        )}
      />
      <button
        type="button"
        onClick={increment}
        disabled={value >= max}
        className={cn(
          "flex items-center justify-center text-secondary-600 hover:bg-gray-50 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
          cls.btn
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
