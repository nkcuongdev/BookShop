import { PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmptyState({
  icon: Icon = PackageOpen,
  title = "Không có dữ liệu",
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-4",
        className
      )}
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center mb-5">
        <Icon className="w-10 h-10 text-primary-500" />
      </div>
      <h3 className="text-xl font-display font-semibold text-secondary-800">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-secondary-500 mt-2 max-w-md">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
