import { Truck, RotateCcw, ShieldCheck, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ITEMS = [
  {
    icon: Truck,
    title: "Giao nhanh 24h",
    desc: "Miễn phí cho đơn từ 200k",
  },
  {
    icon: RotateCcw,
    title: "Đổi trả 7 ngày",
    desc: "Đổi trả dễ dàng tại nhà",
  },
  {
    icon: ShieldCheck,
    title: "Sách chính hãng",
    desc: "Cam kết 100% bản quyền",
  },
  {
    icon: Headphones,
    title: "Hỗ trợ 24/7",
    desc: "Tư vấn nhiệt tình mọi lúc",
  },
];

export default function TrustBadgeRow({
  items = DEFAULT_ITEMS,
  variant = "card",
  className,
}) {
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground",
          className
        )}
      >
        {items.map((item) => (
          <div key={item.title} className="flex items-center gap-2">
            <item.icon className="size-4 text-primary" />
            <span>{item.title}</span>
          </div>
        ))}
      </div>
    );
  }

  // One slim bar for the home page, between the banners and the first product
  // row: titles only on small screens, the detail line from lg up.
  if (variant === "strip") {
    return (
      <ul
        className={cn(
          "grid grid-cols-2 gap-y-1 rounded-lg bg-card px-2 py-2 shadow-rest ring-1 ring-foreground/[0.06] sm:grid-cols-4 sm:divide-x sm:divide-border sm:py-3",
          className
        )}
      >
        {items.map((item) => (
          <li
            key={item.title}
            className="flex min-w-0 items-center gap-2.5 px-2 py-1 sm:justify-center sm:px-3 lg:gap-3"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-primary lg:size-10">
              <item.icon className="size-4 lg:size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight text-foreground lg:text-sm">
                {item.title}
              </span>
              <span className="mt-0.5 hidden truncate text-xs text-muted-foreground lg:block">
                {item.desc}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 lg:grid-cols-4 gap-4",
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.title}
          className="flex items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.06] shadow-rest transition-[box-shadow,transform,--tw-ring-color] duration-base ease-out-soft hover:ring-primary/25 hover:shadow-lift"
        >
          <div className="size-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
            <item.icon className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm">
              {item.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
