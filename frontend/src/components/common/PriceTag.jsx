import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils/format";

const priceVariants = cva("font-bold text-primary", {
  variants: {
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
      xl: "text-2xl",
      "2xl": "text-3xl",
    },
  },
  defaultVariants: { size: "md" },
});

const originalPriceVariants = cva(
  "text-muted-foreground/70 line-through font-medium",
  {
    variants: {
      size: {
        sm: "text-xs",
        md: "text-sm",
        lg: "text-sm",
        xl: "text-sm",
        "2xl": "text-base",
      },
    },
    defaultVariants: { size: "md" },
  }
);

// Discount chip uses the orange brand accent, not red: a discount is a sale
// signal, not an error. text-brand-strong on bg-brand-muted is 5.08:1, while
// the old text-red-500 on bg-red-50 was 3.44:1 at these type sizes.
const savingsVariants = cva("font-semibold", {
  variants: {
    size: {
      sm: "text-[11px]",
      md: "text-xs",
      lg: "text-xs",
      xl: "text-sm",
      "2xl": "text-sm",
    },
  },
  defaultVariants: { size: "md" },
});

export default function PriceTag({
  price,
  originalPrice = null,
  size = "md",
  showSaved = false,
  className,
}) {
  const hasDiscount = originalPrice && originalPrice > price;
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;
  const saved = hasDiscount ? originalPrice - price : 0;

  return (
    <div className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <span className={priceVariants({ size })}>{formatVND(price)}</span>
      {hasDiscount && (
        <>
          <span className={originalPriceVariants({ size })}>
            {formatVND(originalPrice)}
          </span>
          <span
            className={cn(
              savingsVariants({ size }),
              "rounded bg-brand-muted px-1.5 py-0.5 text-brand-strong"
            )}
          >
            -{discountPercent}%
          </span>
          {showSaved && (
            <span
              className={cn(savingsVariants({ size }), "text-success-strong")}
            >
              Tiết kiệm {formatVND(saved)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
