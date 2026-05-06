import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { adminAPI } from "@/services/api";
import { formatDateTimeVN, formatOrderCode } from "@/utils/format";
import { MobileSidebarSheet } from "./MobileSidebarSheet";
import { UserMenu } from "./UserMenu";
import { findActiveLabel } from "./navConfig";
import { AdminBreadcrumb } from "./AdminBreadcrumb";

export function AdminTopbar() {
  const STORAGE_KEY = "admin-read-notifications";
  const { pathname } = useLocation();
  const title = findActiveLabel(pathname);
  const [readIds, setReadIds] = useState([]);
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["admin", "topbar-notifications"],
    queryFn: () =>
      adminAPI
        .getOrders({ limit: 8, sortBy: "createdAt", sortOrder: "desc" })
        .then((r) => r.data?.orders || []),
    staleTime: 30_000,
  });

  const notifications = orders.slice(0, 5).map((order) => {
    const amount = Number(order?.totalAmount || 0);
    return {
      id: order?._id || order?.id,
      title: `Đơn mới ${formatOrderCode(order)}`,
      description: `${amount.toLocaleString("vi-VN")}đ`,
      time: formatDateTimeVN(order?.createdAt),
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setReadIds(parsed.filter((id) => typeof id === "string" && id.trim()));
      }
    } catch {
      setReadIds([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
  }, [readIds]);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => n.id && !readIds.includes(n.id)),
    [notifications, readIds]
  );
  const hasNewNotifications = unreadNotifications.length > 0;

  const markAllAsRead = () => {
    const currentIds = notifications.map((n) => n.id).filter(Boolean);
    if (!currentIds.length) return;
    setReadIds((prev) => Array.from(new Set([...prev, ...currentIds])));
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <MobileSidebarSheet />

      <div className="hidden flex-col lg:flex">
        <h2 className="text-sm font-display font-semibold text-secondary-900">
          {title}
        </h2>
        <AdminBreadcrumb />
      </div>

      <div className="flex-1" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
            <Bell className="h-4 w-4" />
            {hasNewNotifications ? (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary-500" />
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-secondary-900">Thông báo</p>
                <p className="text-[11px] text-secondary-500">
                  {isLoading
                    ? "Đang tải thông báo..."
                    : isError
                      ? "Không thể tải thông báo"
                      : `${unreadNotifications.length} chưa đọc`}
                </p>
              </div>
              {!isLoading && !isError && notifications.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto px-2 py-1 text-[11px] text-primary-600 hover:text-primary-700"
                  onClick={markAllAsRead}
                >
                  Đánh dấu tất cả đã đọc
                </Button>
              ) : null}
            </div>
          </div>
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id || n.title} className="flex gap-3 p-3 hover:bg-gray-50">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    n.id && readIds.includes(n.id) ? "bg-gray-300" : "bg-primary-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-secondary-800">{n.title}</p>
                  <p className="truncate text-xs text-secondary-500">{n.description}</p>
                </div>
                <span className="text-[10px] text-secondary-400">{n.time || "-"}</span>
              </li>
            ))}
            {!isLoading && !isError && notifications.length === 0 ? (
              <li className="p-4 text-xs text-secondary-500">Chưa có thông báo mới.</li>
            ) : null}
          </ul>
        </PopoverContent>
      </Popover>

      <div className="mx-1 hidden h-6 w-px bg-gray-200 md:block" />

      <UserMenu />
    </header>
  );
}
