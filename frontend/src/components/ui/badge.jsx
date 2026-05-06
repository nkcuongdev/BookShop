import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40",
  {
    variants: {
      variant: {
        default: "bg-primary-500 text-white",
        secondary: "bg-secondary-100 text-secondary-700",
        outline: "border border-gray-200 text-secondary-700",
        success:
          "bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow",
        sale: "bg-gradient-to-r from-red-500 to-rose-500 text-white shadow",
        bestseller:
          "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow",
        new: "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow",
        warning: "bg-amber-100 text-amber-800",
        destructive: "bg-red-500 text-white",
        info: "bg-sky-100 text-sky-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
