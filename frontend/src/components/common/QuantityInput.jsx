import { Minus, Plus } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Module scope on purpose — this object used to be rebuilt on every render.
const stepButtonVariants = cva(
  "flex items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      size: { sm: "size-8", md: "size-10", lg: "size-12" },
    },
    defaultVariants: { size: "md" },
  }
);

const quantityFieldVariants = cva(
  "border-x border-border bg-transparent text-center font-semibold focus:bg-muted focus:outline-none",
  {
    variants: {
      size: {
        sm: "h-8 w-12 text-sm",
        md: "h-10 w-14 text-base",
        lg: "h-12 w-16 text-lg",
      },
    },
    defaultVariants: { size: "md" },
  }
);

export default function QuantityInput({
  value = 1,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  className,
  disabled = false,
}) {
  const decrement = () => onChange?.(Math.max(min, value - 1));
  const increment = () => onChange?.(Math.min(max, value + 1));

  return (
    <div
      className={cn(
        "inline-flex items-center overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <button
        type="button"
        onClick={decrement}
        disabled={disabled || value <= min}
        className={stepButtonVariants({ size })}
      >
        <Minus className="size-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const num = parseInt(e.target.value.replace(/\D/g, ""), 10);
          if (!isNaN(num)) onChange?.(Math.min(max, Math.max(min, num)));
          else if (e.target.value === "") onChange?.(min);
        }}
        className={quantityFieldVariants({ size })}
      />
      <button
        type="button"
        onClick={increment}
        disabled={disabled || value >= max}
        className={stepButtonVariants({ size })}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
