import { cn } from "@/lib/utils";
import { formatVND } from "@/utils/format";

const sizes = {
  sm: { price: "text-sm", old: "text-xs", save: "text-[11px]" },
  md: { price: "text-base", old: "text-sm", save: "text-xs" },
  lg: { price: "text-lg", old: "text-sm", save: "text-xs" },
  xl: { price: "text-2xl", old: "text-sm", save: "text-sm" },
  "2xl": { price: "text-3xl", old: "text-base", save: "text-sm" },
};

export default function PriceTag({
  price,
  originalPrice = null,
  size = "md",
  showSaved = false,
  className,
}) {
  const cls = sizes[size] || sizes.md;
  const hasDiscount = originalPrice && originalPrice > price;
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;
  const saved = hasDiscount ? originalPrice - price : 0;

  return (
    <div className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <span className={cn("font-bold text-primary-600", cls.price)}>
        {formatVND(price)}
      </span>
      {hasDiscount && (
        <>
          <span
            className={cn(
              "text-secondary-400 line-through font-medium",
              cls.old
            )}
          >
            {formatVND(originalPrice)}
          </span>
          <span
            className={cn(
              "font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded",
              cls.save
            )}
          >
            -{discountPercent}%
          </span>
          {showSaved && (
            <span
              className={cn("text-emerald-600 font-medium", cls.save)}
            >
              Tiết kiệm {formatVND(saved)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
