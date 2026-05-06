import { useEffect, useState } from "react";
import { Sparkles, Truck, X } from "lucide-react";

const STORAGE_KEY = "bookshop_announcement_dismissed_v1";

export default function AnnouncementBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  return (
    <div className="relative bg-gradient-to-r from-secondary-900 via-secondary-800 to-secondary-900 text-white text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3">
        <Sparkles className="w-4 h-4 text-primary-400 shrink-0" />
        <p className="text-center leading-snug">
          <span className="font-semibold text-primary-300">FREESHIP</span>{" "}
          cho đơn từ{" "}
          <span className="font-semibold">200.000đ</span> · Giảm thêm{" "}
          <span className="font-semibold">10%</span> cho thành viên mới
        </p>
        <Truck className="w-4 h-4 text-primary-400 shrink-0 hidden sm:inline-block" />
      </div>
      <button
        onClick={dismiss}
        aria-label="Đóng thông báo"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
