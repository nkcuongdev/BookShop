import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-foreground",
        // Gradients keep their retail punch, but BOTH stops must be dark enough
        // for white text at the 11-12px sizes these are used at (AA needs
        // 4.5:1). Measured: every stop below clears it. Using the light -500
        // tints here would fail (white on --success is only 2.59:1).
        success:
          "bg-gradient-to-r from-success-strong to-info-strong text-success-foreground shadow",
        sale: "bg-gradient-to-r from-brand-vivid to-danger-strong text-brand-foreground shadow",
        bestseller:
          "bg-gradient-to-r from-warning-strong to-brand-strong text-white shadow",
        new: "bg-gradient-to-r from-info-strong to-primary text-info-foreground shadow",
        warning: "bg-warning-muted text-warning-strong",
        // --destructive is only 3.78:1 with white, legal for button-size text
        // but not for an 11px badge, so this fill uses the darker step.
        destructive: "bg-danger-strong text-danger-foreground",
        info: "bg-info-muted text-info-strong",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Badge = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";

export { Badge, badgeVariants };
