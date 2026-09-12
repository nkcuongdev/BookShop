import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Determinate progress / meter bar.
 *
 * Replaces three hand-rolled `style={{ width: pct }}` implementations
 * (RatingSummary, FunnelStats, VouchersList) that each rebuilt the same
 * two-div track+fill and none of which exposed the value to assistive tech.
 */
const fillVariants = cva(
  "h-full rounded-full transition-[width] duration-slow ease-out-soft",
  {
    variants: {
      intent: {
        primary: "bg-primary",
        brand: "bg-gradient-to-r from-warning to-brand-vivid",
        success: "bg-success-strong",
        warning: "bg-warning-strong",
        danger: "bg-danger-strong",
      },
      size: { sm: "", md: "", lg: "" },
    },
    defaultVariants: { intent: "primary" },
  }
);

const trackVariants = cva("w-full overflow-hidden rounded-full bg-muted", {
  variants: {
    size: { sm: "h-1.5", md: "h-2", lg: "h-3" },
  },
  defaultVariants: { size: "md" },
});

/**
 * @param value  0..max
 * @param max    defaults to 100
 * @param label  accessible name — required when the bar is not next to a label
 */
export const Progress = React.forwardRef(
  ({ value = 0, max = 100, intent, size, label, className, ...props }, ref) => {
    const safeMax = max > 0 ? max : 100;
    const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
        className={cn(trackVariants({ size }), className)}
        {...props}
      >
        <div
          className={fillVariants({ intent, size })}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export default Progress;
