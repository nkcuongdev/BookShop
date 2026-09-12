import * as React from "react";
import { cva } from "class-variance-authority";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline callout. Replaces 13 hand-rolled `rounded-xl border border-X bg-X-muted`
 * blocks plus two byte-identical auth error banners in Login and Register.
 *
 * Uses the same intent vocabulary as status-badge.jsx, so an "info" alert and an
 * "info" status chip agree on colour.
 */
const alertVariants = cva(
  "relative flex gap-3 rounded-xl p-4 text-sm ring-1 ring-inset",
  {
    variants: {
      intent: {
        neutral: "bg-muted text-foreground ring-border",
        info: "bg-info-muted text-info-strong ring-info/20",
        success: "bg-success-muted text-success-strong ring-success/20",
        warning: "bg-warning-muted text-warning-strong ring-warning/25",
        danger: "bg-danger-muted text-danger-strong ring-danger/20",
      },
    },
    defaultVariants: { intent: "neutral" },
  }
);

const DEFAULT_ICONS = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

/**
 * @param intent  neutral | info | success | warning | danger
 * @param icon    override the default icon; `false` hides it
 * @param title   optional bold first line
 * @param action  trailing node, e.g. a retry button
 */
export const Alert = React.forwardRef(
  ({ intent = "neutral", icon, title, action, className, children, ...props }, ref) => {
    const Icon = icon === false ? null : icon || DEFAULT_ICONS[intent];

    return (
      <div
        ref={ref}
        // Errors and warnings must interrupt a screen reader; info does not.
        role={intent === "danger" ? "alert" : "status"}
        className={cn(alertVariants({ intent }), className)}
        {...props}
      >
        {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && (
            <div className={cn(title && "mt-1", "text-current/90")}>{children}</div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    );
  }
);
Alert.displayName = "Alert";

export { alertVariants };
export default Alert;
