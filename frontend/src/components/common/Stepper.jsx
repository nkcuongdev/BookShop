import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Generic step indicator. Was CheckoutStepper in components/checkout/ despite
 * having no checkout-specific logic — and only one consumer.
 */
export default function Stepper({ steps = [], currentStep = 1, className }) {
  return (
    <ol
      className={cn(
        "flex items-center w-full overflow-x-auto no-scrollbar",
        className
      )}
    >
      {steps.map((step, idx) => {
        const num = idx + 1;
        const isDone = num < currentStep;
        const isActive = num === currentStep;
        return (
          <li
            key={step.key || idx}
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "flex items-center shrink-0",
              idx !== steps.length - 1 && "flex-1"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "size-8 rounded-full flex items-center justify-center text-sm font-bold transition-all shrink-0",
                  isDone
                    ? "bg-success-strong text-white"
                    : isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary-500/20"
                    : "bg-muted text-muted-foreground/70"
                )}
              >
                {isDone ? <Check className="size-4" /> : num}
              </div>
              <div className="hidden sm:block">
                <p
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide",
                    isActive
                      ? "text-primary"
                      : isDone
                      ? "text-success-strong"
                      : "text-muted-foreground/70"
                  )}
                >
                  {step.label}
                </p>
                {step.sub && (
                  <p className="text-[10px] text-muted-foreground/70">{step.sub}</p>
                )}
              </div>
            </div>
            {idx !== steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-3 rounded-full transition-colors",
                  isDone ? "bg-success" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
