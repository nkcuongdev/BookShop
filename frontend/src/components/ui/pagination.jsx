import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Prev / page-indicator / next.
 *
 * The admin side has DataTablePagination; the storefront hand-rolled the same
 * prev-next-plus-"Trang N / M" widget twice (NewsList, ProfileNotifications).
 *
 * @param page        current page, 1-indexed
 * @param totalPages  total page count; renders nothing when <= 1
 * @param onChange    (nextPage) => void
 * @param disabled    e.g. while a fetch is in flight
 */
export default function Pagination({
  page = 1,
  totalPages = 1,
  onChange,
  disabled = false,
  className,
}) {
  if (totalPages <= 1) return null;

  const go = (next) => {
    const clamped = Math.min(totalPages, Math.max(1, next));
    if (clamped !== page) onChange?.(clamped);
  };

  return (
    <nav
      aria-label="Phân trang"
      className={cn("flex items-center justify-center gap-3", className)}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || page <= 1}
        onClick={() => go(page - 1)}
        aria-label="Trang trước"
      >
        <ChevronLeft className="size-4" />
        Trước
      </Button>

      {/* aria-live so screen readers hear the page change without moving focus */}
      <span aria-live="polite" className="text-sm text-muted-foreground">
        Trang <span className="font-semibold text-foreground">{page}</span> /{" "}
        {totalPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        disabled={disabled || page >= totalPages}
        onClick={() => go(page + 1)}
        aria-label="Trang sau"
      >
        Sau
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
