import { useState } from "react";
import { Sparkles, Truck, X } from "lucide-react";

const STORAGE_KEY = "bookshop_announcement_dismissed_v1";

export default function AnnouncementBar() {
  const [show, setShow] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== "1"
  );

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  return (
    <div className="relative bg-gradient-to-r from-deep via-deep-raised to-deep text-deep-foreground text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3">
        <Sparkles className="size-4 text-primary-300 shrink-0" />
        <p className="text-center leading-snug">
          <span className="font-semibold text-primary-200">FREESHIP</span>{" "}
          cho đơn từ{" "}
          <span className="font-semibold">200.000đ</span> · Giảm thêm{" "}
          <span className="font-semibold">10%</span> cho thành viên mới
        </p>
        <Truck className="size-4 text-primary-300 shrink-0 hidden sm:inline-block" />
      </div>
      <button
        onClick={dismiss}
        aria-label="Đóng thông báo"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
