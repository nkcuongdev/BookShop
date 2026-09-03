import { MessageSquare, Package, Star, ShoppingBag, Ticket, UserPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS = {
  order: ShoppingBag,
  review: Star,
  user: UserPlus,
  stock: Package,
  voucher: Ticket,
  message: MessageSquare,
};

const ACCENTS = {
  order: "bg-primary-50 text-primary",
  review: "bg-warning-muted text-warning-strong",
  user: "bg-success-muted text-success-strong",
  stock: "bg-danger-muted text-danger-strong",
  voucher: "bg-violet-100 text-violet-700",
  message: "bg-info-muted text-info-strong",
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.floor(h / 24);
  return `${d} ngày`;
}

export function ActivityFeed({ items = [], isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((it, i) => {
        const Icon = ICONS[it.type] || MessageSquare;
        return (
          <li key={i} className="flex items-start gap-3">
            <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${ACCENTS[it.type] || ACCENTS.message}`}>
              <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{it.text}</p>
              <p className="text-[11px] text-muted-foreground/70">{timeAgo(it.at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
