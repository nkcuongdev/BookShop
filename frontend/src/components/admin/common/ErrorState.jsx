import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Có lỗi xảy ra",
  description = "Không thể tải dữ liệu. Vui lòng thử lại.",
  onRetry,
  className,
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-10 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-secondary-800">{title}</h4>
        <p className="mt-1 text-xs text-secondary-500 max-w-sm">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" />
          Thử lại
        </Button>
      )}
    </div>
  );
}
