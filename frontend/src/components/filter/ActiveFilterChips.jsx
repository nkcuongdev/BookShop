import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ActiveFilterChips({
  chips = [],
  onClear,
  className,
}) {
  if (chips.length === 0) return null;

  return (
    <div className={"flex flex-wrap items-center gap-2 " + (className || "")}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => chip.onRemove?.()}
          className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-700 rounded-full px-3 py-1 text-xs font-medium hover:bg-primary-100 transition-colors"
        >
          {chip.label}
          <X className="w-3 h-3" />
        </button>
      ))}
      {onClear && (
        <button
          onClick={onClear}
          className="text-xs text-secondary-500 hover:text-red-500 font-medium underline underline-offset-2"
        >
          Xóa tất cả
        </button>
      )}
    </div>
  );
}
