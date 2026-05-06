import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-secondary-400">
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-secondary-800">{title}</h4>
        {description && (
          <p className="mt-1 text-xs text-secondary-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
