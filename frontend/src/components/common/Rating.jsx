import { useState } from "react";
import { Star } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Filled stars use --warning: 2.14:1 on white, below the 3:1 WCAG asks of
 * meaningful graphics (the previous amber-400 was worse, at 1.67:1). Kept
 * deliberately — a yellow star is an industry-wide convention and darkening it
 * enough to pass reads as brown.
 *
 * Known limitation, measured: filled vs empty stars are only 1.68:1 apart, so
 * the fill/empty distinction is carried by shape more than by luminance. This
 * cannot be fixed by adjusting the empty star — the filled star is barely
 * darker than the page, so no empty value is both lighter than it and 3:1 away.
 * Reaching 3:1 requires darkening --warning to ~36% lightness, which is the
 * brown-looking option we rejected.
 *
 * Most call sites render the numeric rating beside these stars, but ReviewList
 * and FilterSidebar do not. The right fix there is an aria-label / visible text,
 * not a darker fill.
 */
const starVariants = cva("transition-colors duration-150", {
  variants: {
    size: {
      xs: "size-3",
      sm: "size-4",
      md: "size-4",
      lg: "size-5",
      xl: "size-6",
    },
  },
  defaultVariants: { size: "sm" },
});

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
                starVariants({ size }),
                star <= Math.floor(display)
                  ? "fill-warning text-warning"
                  : star - 0.5 <= display
                  ? "fill-warning/50 text-warning"
                  : "fill-border text-border"
              )}
            />
          </button>
        ))}
      </div>
      {showValue && (
        <span className="text-xs font-semibold text-foreground">
          {Number(value).toFixed(1)}
        </span>
      )}
      {reviewCount !== null && (
        <span className="text-xs text-muted-foreground/70">
          ({reviewCount.toLocaleString()})
        </span>
      )}
    </div>
  );
}
