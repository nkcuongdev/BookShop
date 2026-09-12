import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * @param retrying when true the retry button spins — previously the RotateCw
 *                 icon never moved, so a refetch gave no feedback at all.
 */
export function ErrorState({
  title = "Có lỗi xảy ra",
  description = "Không thể tải dữ liệu. Vui lòng thử lại.",
  onRetry,
  retrying = false,
  className,
}) {
  return (
    <div
      // The app had zero role="alert" anywhere, so failures were never announced.
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-10 text-center",
        "animate-in fade-in duration-base ease-out-soft",
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-danger-muted text-danger-strong">
        <AlertTriangle className="size-7" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          loadingText="Đang tải lại..."
        >
          <RotateCw className="size-4" />
          Thử lại
        </Button>
      )}
    </div>
  );
}
