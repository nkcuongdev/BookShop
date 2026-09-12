import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cva } from "class-variance-authority";

// Accent keys are kept as-is so call sites don't change, but the colours now
// come from intent tokens. `violet` stays literal — a legitimate sixth hue with
// no matching intent. Standardised on the -100/-700 pair (5.98:1) which is what
// every other violet site in the app now uses.
const accentVariants = cva(
  "flex size-10 items-center justify-center rounded-xl",
  {
    variants: {
      accent: {
        primary: "bg-primary-50 text-primary",
        blue: "bg-info-muted text-info-strong",
        green: "bg-success-muted text-success-strong",
        amber: "bg-warning-muted text-warning-strong",
        rose: "bg-danger-muted text-danger-strong",
        violet: "bg-violet-100 text-violet-700",
      },
    },
    defaultVariants: { accent: "primary" },
  }
);

const deltaVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
  {
    variants: {
      direction: {
        up: "bg-success-muted text-success-strong",
        down: "bg-danger-muted text-danger-strong",
      },
    },
    defaultVariants: { direction: "up" },
  }
);

export function StatCard({
  title,
  value,
  delta,
  icon: Icon,
  accent = "primary",
  footer,
}) {
  const isUp = typeof delta === "number" ? delta >= 0 : null;

  return (
    <div className="group rounded-2xl bg-card p-5 ring-1 ring-foreground/[0.06] shadow-rest transition-[box-shadow,transform,--tw-ring-color] duration-base ease-out-soft hover:ring-foreground/10 hover:shadow-lift hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-2xl font-display font-bold text-foreground">
            {value}
          </p>
        </div>
        {Icon && (
          <div className={accentVariants({ accent })}>
            <Icon className="size-5" />
          </div>
        )}
      </div>
      {(delta !== undefined || footer) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {delta !== undefined && (
            <span className={deltaVariants({ direction: isUp ? "up" : "down" })}>
              {isUp ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {footer && <span className="text-muted-foreground">{footer}</span>}
        </div>
      )}
    </div>
  );
}
