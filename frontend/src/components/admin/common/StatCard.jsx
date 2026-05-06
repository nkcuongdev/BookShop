import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ title, value, delta, icon: Icon, accent = "primary", footer }) {
  const accents = {
    primary: "bg-primary-50 text-primary-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
  };

  const isUp = typeof delta === "number" ? delta >= 0 : null;

  return (
    <div className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-secondary-500">
            {title}
          </p>
          <p className="mt-2 text-2xl font-display font-bold text-secondary-900">
            {value}
          </p>
        </div>
        {Icon && (
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", accents[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {(delta !== undefined || footer) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                isUp ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              )}
            >
              {isUp ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {footer && <span className="text-secondary-500">{footer}</span>}
        </div>
      )}
    </div>
  );
}
