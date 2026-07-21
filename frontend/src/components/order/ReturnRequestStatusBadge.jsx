import { cn } from "@/lib/utils";
import { RETURN_STATUS_META } from "@/features/returns/constants";

export default function ReturnRequestStatusBadge({ status, className }) {
  const meta = RETURN_STATUS_META[status] || {
    label: status || "Không xác định",
    className: "bg-muted text-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        meta.className,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
}
