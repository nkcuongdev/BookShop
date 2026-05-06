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
  order: "bg-primary-50 text-primary-600",
  review: "bg-amber-50 text-amber-600",
  user: "bg-emerald-50 text-emerald-600",
  stock: "bg-rose-50 text-rose-600",
  voucher: "bg-violet-50 text-violet-600",
  message: "bg-blue-50 text-blue-600",
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
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ACCENTS[it.type] || ACCENTS.message}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-secondary-800">{it.text}</p>
              <p className="text-[11px] text-secondary-400">{timeAgo(it.at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
