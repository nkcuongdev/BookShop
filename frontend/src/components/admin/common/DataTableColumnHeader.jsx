import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function DataTableColumnHeader({ column, title, className }) {
  if (!column?.getCanSort?.()) {
    return <span className={cn(className)}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground transition-colors",
        className
      )}
    >
      <span>{title}</span>
      {sorted === "asc" ? (
        <ArrowUp className="size-4" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-4" />
      ) : (
        <ChevronsUpDown className="size-4 opacity-50" />
      )}
    </button>
  );
}
