import * as React from "react";
import { cva } from "class-variance-authority";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  PackageCheck,
  RotateCcw,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusMeta } from "@/lib/status";

/**
 * Every intent pairs a `-muted` surface with `-strong` text. Those pairs are
 * measured to clear WCAG AA (>=4.5:1) — the maps this replaces used three
 * different contrast levels, several of which failed (e.g. text-amber-600 on
 * bg-amber-50 was 3.07:1, and all four PaymentResult tones were below 4.5).
 */
export const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
  {
    variants: {
      intent: {
        neutral: "bg-muted text-muted-foreground ring-border",
        info: "bg-info-muted text-info-strong ring-info/20",
        success: "bg-success-muted text-success-strong ring-success/20",
        warning: "bg-warning-muted text-warning-strong ring-warning/25",
        danger: "bg-danger-muted text-danger-strong ring-danger/20",
        brand: "bg-brand-muted text-brand-strong ring-brand/25",
      },
    },
    defaultVariants: { intent: "neutral" },
  }
);

/**
 * Same intent vocabulary, no chip geometry — for larger surfaces such as the
 * 64px icon circle on PaymentResult. Kept separate rather than adding a `size`
 * variant: a 20px chip and a 64px circle share colours, not shape.
 */
export const statusSurfaceVariants = cva("", {
  variants: {
    intent: {
      neutral: "bg-muted text-muted-foreground border-border",
      info: "bg-info-muted text-info-strong border-info/20",
      success: "bg-success-muted text-success-strong border-success/20",
      warning: "bg-warning-muted text-warning-strong border-warning/25",
      danger: "bg-danger-muted text-danger-strong border-danger/20",
      brand: "bg-brand-muted text-brand-strong border-brand/25",
    },
  },
  defaultVariants: { intent: "neutral" },
});

// Resolved here so lib/status.js can stay icon-free (see its header comment).
const ICONS = {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  PackageCheck,
  RotateCcw,
  Truck,
  Undo2,
  XCircle,
};

export function getStatusIcon(name) {
  return name ? ICONS[name] ?? null : null;
}

/**
 * Status chip. Pass `status` to resolve label+intent from the shared table, or
 * `intent` directly to bypass it.
 *
 * @param dot  render the small leading dot (admin table affordance)
 * @param icon render the status' lucide icon (customer-facing order badges)
 */
export const StatusBadgeBase = React.forwardRef(
  (
    { status, intent, label, dot = false, icon = false, className, children, ...props },
    ref
  ) => {
    const meta = status != null ? getStatusMeta(status, label) : null;
    const resolvedIntent = intent ?? meta?.intent ?? "neutral";
    const resolvedLabel = label ?? meta?.label ?? "";
    const Icon = icon ? getStatusIcon(meta?.icon) : null;

    return (
      <span
        ref={ref}
        className={cn(statusBadgeVariants({ intent: resolvedIntent }), className)}
        {...props}
      >
        {dot && (
          <span className="size-1.5 rounded-full bg-current opacity-70" />
        )}
        {Icon && <Icon className="size-4" />}
        {children ?? resolvedLabel}
      </span>
    );
  }
);
StatusBadgeBase.displayName = "StatusBadgeBase";
