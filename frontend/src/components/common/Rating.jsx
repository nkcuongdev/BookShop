import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const sizes = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  xl: "w-6 h-6",
};

export default function Rating({
  value = 0,
  size = "sm",
  showValue = false,
  reviewCount = null,
  interactive = false,
  onChange = null,
  className,
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange?.(star)}
            onMouseEnter={() => interactive && setHover(star)}
            onMouseLeave={() => interactive && setHover(0)}
            className={cn(
              "leading-none",
              interactive
                ? "cursor-pointer hover:scale-110 transition-transform"
                : "cursor-default"
            )}
          >
            <Star
              className={cn(
                sizes[size],
                "transition-colors duration-150",
                star <= Math.floor(display)
                  ? "fill-amber-400 text-amber-400"
                  : star - 0.5 <= display
                  ? "fill-amber-400/50 text-amber-400"
                  : "fill-gray-200 text-gray-200"
              )}
            />
          </button>
        ))}
      </div>
      {showValue && (
        <span className="text-xs font-semibold text-secondary-700">
          {Number(value).toFixed(1)}
        </span>
      )}
      {reviewCount !== null && (
        <span className="text-xs text-secondary-400">
          ({reviewCount.toLocaleString()})
        </span>
      )}
    </div>
  );
}
