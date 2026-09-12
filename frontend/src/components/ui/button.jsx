import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // --primary is indigo-700, so hover must go DARKER (-800). Hovering to
        // -600 would lighten the button — the old orange ramp sat at -500.
        default:
          "bg-primary text-primary-foreground shadow-primary-glow hover:bg-primary-800 hover:shadow-primary-glow-lg",
        destructive:
          "bg-destructive text-destructive-foreground shadow-rest hover:bg-danger-strong",
        outline:
          "border border-input bg-card text-foreground hover:bg-muted hover:border-muted-foreground/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted-foreground/15",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        xl: "h-14 px-10 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/**
 * @param loading     shows a spinner and disables the button. Roughly 15
 *                    mutations across the app had no in-flight feedback at all —
 *                    only a `disabled` prop or a text swap — because there was
 *                    no built-in way to express it.
 * @param loadingText replaces the label while loading; without it the label
 *                    stays and only the spinner is added.
 *
 * Ignored when `asChild` is set: Radix Slot forwards to a single child, so
 * injecting a spinner there would break the element (and an `<a>` has no
 * loading state anyway).
 */
const Button = React.forwardRef(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const showSpinner = loading && !asChild;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={showSpinner || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {showSpinner && <Loader2 className="size-4 animate-spin" />}
            {showSpinner && loadingText ? loadingText : children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
