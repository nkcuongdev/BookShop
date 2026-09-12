import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Boolean toggle.
 *
 * Hand-rolled on a native <button role="switch"> rather than adding
 * @radix-ui/react-switch: it isn't installed, and the JS bundle has a budget.
 * (@radix-ui/react-toggle IS in package.json but unused — it's a toggle *button*,
 * a different control, so it doesn't help here.)
 *
 * Replaces four raw `type="checkbox"` inputs that were styling boolean settings
 * — "set as default address", "published" — where a switch is the right affordance.
 */
export const Switch = React.forwardRef(
  ({ checked = false, onCheckedChange, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-base ease-out-soft",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "size-5 rounded-full bg-card shadow-rest transition-transform duration-base ease-out-soft",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  )
);
Switch.displayName = "Switch";

export default Switch;
