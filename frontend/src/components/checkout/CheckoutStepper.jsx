import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CheckoutStepper({ steps = [], currentStep = 1, className }) {
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
            className={cn(
              "flex items-center shrink-0",
              idx !== steps.length - 1 && "flex-1"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all shrink-0",
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isActive
                    ? "bg-primary-500 text-white ring-4 ring-primary-500/20"
                    : "bg-gray-100 text-secondary-400"
                )}
              >
                {isDone ? <Check className="w-4 h-4" /> : num}
              </div>
              <div className="hidden sm:block">
                <p
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide",
                    isActive
                      ? "text-primary-600"
                      : isDone
                      ? "text-emerald-600"
                      : "text-secondary-400"
                  )}
                >
                  {step.label}
                </p>
                {step.sub && (
                  <p className="text-[10px] text-secondary-400">{step.sub}</p>
                )}
              </div>
            </div>
            {idx !== steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-3 rounded-full transition-colors",
                  isDone ? "bg-emerald-500" : "bg-gray-200"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
