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
          "flex flex-wrap gap-x-6 gap-y-2 text-sm text-secondary-600",
          className
        )}
      >
        {items.map((item) => (
          <div key={item.title} className="flex items-center gap-2">
            <item.icon className="w-4 h-4 text-primary-500" />
            <span>{item.title}</span>
          </div>
        ))}
      </div>
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
          className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-gray-100 hover:border-primary-200 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
            <item.icon className="w-5 h-5 text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-secondary-800 text-sm">
              {item.title}
            </p>
            <p className="text-xs text-secondary-500 mt-0.5">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
