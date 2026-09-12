import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { notificationsAPI } from "@/services/api";
import { connectSocket } from "@/services/socket";
import { formatDateTimeVN } from "@/utils/format";
import { MobileSidebarSheet } from "./MobileSidebarSheet";
import { UserMenu } from "./UserMenu";
import { findActiveLabel } from "./navConfig";
import { AdminBreadcrumb } from "./AdminBreadcrumb";

export function AdminTopbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const title = findActiveLabel(pathname);
  const notificationsQuery = useQuery({
    queryKey: ["notifications", "admin"],
    queryFn: () => notificationsAPI.getAll(20).then((response) => response.data),
    staleTime: 30_000,
  });
  const notifications = notificationsQuery.data?.notifications || [];
  const unreadCount = notificationsQuery.data?.unreadCount || 0;

  useEffect(() => {
    const socket = connectSocket();
    const onNew = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
    socket.on("notification:new", onNew);
    return () => socket.off("notification:new", onNew);
  }, [queryClient]);

  const markAllAsRead = async () => {
    await notificationsAPI.markAllRead();
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const openNotification = async (notification) => {
    if (!notification.readAt) {
      await notificationsAPI.markRead(notification._id || notification.id).catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (notification.link) navigate(notification.link);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 glass-chrome border-b border-border px-4 sm:px-6">
      <MobileSidebarSheet />

      <div className="hidden flex-col lg:flex">
        {/* Was an <h2> at 14px — a page-title label, not a document heading. */}
        <p className="text-sm font-display font-semibold text-foreground">{title}</p>
        <AdminBreadcrumb />
      </div>

      <div className="flex-1" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Thông báo</p>
                <p className="text-[11px] text-muted-foreground">
                  {notificationsQuery.isLoading
                    ? "Đang tải thông báo..."
                    : notificationsQuery.isError
                      ? "Không thể tải thông báo"
                      : `${unreadCount} chưa đọc`}
                </p>
              </div>
              {unreadCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto px-2 py-1 text-[11px] text-primary"
                  onClick={markAllAsRead}
                >
                  Đánh dấu tất cả đã đọc
                </Button>
              )}
            </div>
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {notifications.map((notification) => (
              <li key={notification._id || notification.id}>
                <button
                  type="button"
                  onClick={() => openNotification(notification)}
                  className="flex w-full gap-3 p-3 text-left hover:bg-muted"
                >
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${
                      notification.readAt ? "bg-muted-foreground/40" : "bg-primary"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {notification.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {notification.message}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground/70">
                    {formatDateTimeVN(notification.createdAt)}
                  </span>
                </button>
              </li>
            ))}
            {!notificationsQuery.isLoading && notifications.length === 0 && (
              <li className="p-4 text-xs text-muted-foreground">Chưa có thông báo.</li>
            )}
          </ul>
        </PopoverContent>
      </Popover>

      <div className="mx-1 hidden h-6 w-px bg-border md:block" />
      <UserMenu />
    </header>
  );
}
