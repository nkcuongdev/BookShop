import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact admin empty tile, sized for data tables.
 * Not the same component as common/EmptyState.jsx, which is the large
 * gradient hero used on customer pages. Kept separate on purpose.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = "Chưa có dữ liệu",
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-10 text-center",
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-7" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
