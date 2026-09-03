import { EmptyState } from "@/components/admin/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVND } from "@/utils/format";

export function TopBooks({ books = [], isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!books.length) return <EmptyState title="Chưa có dữ liệu" />;

  return (
    <ul className="space-y-2">
      {books.map((b, i) => {
        const rank = i + 1;
        const rankCls =
          rank === 1
            ? "bg-warning-strong text-white"
            : rank === 2
            ? "bg-muted-foreground/40 text-foreground"
            : rank === 3
            ? "bg-warning-strong text-white"
            : "bg-muted text-muted-foreground";
        return (
          <li key={b._id || b.id} className="flex items-center gap-3 rounded-xl hover:bg-muted p-2 transition-colors">
            <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${rankCls}`}>
              {rank}
            </div>
            <img
              src={b.imageUrl || b.image}
              alt={b.title}
              className="h-12 w-9 shrink-0 rounded-lg object-cover bg-muted"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{b.title}</p>
              <p className="truncate text-xs text-muted-foreground">{b.author}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-primary">
                {formatVND((b.sold || 0) * (b.price || 0))}
              </p>
              <p className="text-[11px] text-muted-foreground">{b.sold || 0} đã bán</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
