import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CheckCheck,
  CreditCard,
  Mail,
  MessageCircle,
  Package,
  PackageCheck,
  Tags,
  RotateCcw,
  Save,
  Settings,
  Truck,
} from "lucide-react";
import { notificationsAPI } from "@/services/api";
import { connectSocket } from "@/services/socket";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatDateTimeVN } from "@/utils/format";
import Pagination from "@/components/ui/pagination";

const TYPE_CONFIG = {
  order: { label: "Đơn hàng", icon: Package, color: "bg-primary-50 text-primary" },
  payment: { label: "Thanh toán", icon: CreditCard, color: "bg-success-muted text-success-strong" },
  shipping: { label: "Giao hàng", icon: Truck, color: "bg-info-muted text-info-strong" },
  refund: { label: "Đổi trả & hoàn tiền", icon: RotateCcw, color: "bg-warning-muted text-warning-strong" },
  chat: { label: "Hỗ trợ", icon: MessageCircle, color: "bg-violet-100 text-violet-700" },
  stock: { label: "Có hàng trở lại", icon: PackageCheck, color: "bg-success-muted text-success-strong" },
  promotion: { label: "Giảm giá sách yêu thích", icon: Tags, color: "bg-brand-muted text-brand-strong" },
  review: { label: "Nhắc đánh giá", icon: BookOpen, color: "bg-danger-muted text-danger-strong" },
  system: { label: "Hệ thống", icon: Bell, color: "bg-muted text-muted-foreground" },
};

const EMPTY_PREFERENCES = {
  inApp: Object.fromEntries(Object.keys(TYPE_CONFIG).map((type) => [type, true])),
  email: Object.fromEntries(
    Object.keys(TYPE_CONFIG).map((type) => [
      type,
      ["order", "payment", "shipping", "refund"].includes(type),
    ]),
  ),
};

export default function ProfileNotifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [type, setType] = useState("all");
  const [readState, setReadState] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState(EMPTY_PREFERENCES);
  const [emailVerified, setEmailVerified] = useState(Boolean(user?.emailVerified));
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await notificationsAPI.getAll({
        page,
        limit: 10,
        type,
        read: readState,
      });
      setItems(response.data?.notifications || []);
      setPagination(response.data?.pagination || { page, totalPages: 0, total: 0 });
      setUnreadCount(response.data?.unreadCount || 0);
    } catch (error) {
      toast.error(error.message || "Không thể tải lịch sử thông báo");
    } finally {
      setLoading(false);
    }
  }, [page, readState, type]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadHistory]);

  useEffect(() => {
    let active = true;
    notificationsAPI
      .getPreferences()
      .then((response) => {
        if (!active) return;
        setPreferences(response.data?.preferences || EMPTY_PREFERENCES);
        setEmailVerified(Boolean(response.data?.emailVerified));
      })
      .catch((error) => {
        if (active) toast.error(error.message || "Không thể tải tùy chọn thông báo");
      })
      .finally(() => {
        if (active) setPreferencesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    const onNew = () => {
      setPage(1);
      void loadHistory();
    };
    socket.on("notification:new", onNew);
    return () => socket.off("notification:new", onNew);
  }, [loadHistory]);

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const openNotification = async (notification) => {
    if (!notification.readAt) {
      await notificationsAPI.markRead(notification._id || notification.id).catch(() => null);
      setItems((current) =>
        readState === "unread"
          ? current.filter(
              (item) =>
                String(item._id || item.id) !==
                String(notification._id || notification.id)
            )
          : current.map((item) =>
              String(item._id || item.id) === String(notification._id || notification.id)
                ? { ...item, readAt: new Date().toISOString() }
                : item
            )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      if (readState === "unread") {
        setPagination((current) => {
          const total = Math.max(0, current.total - 1);
          return {
            ...current,
            total,
            totalPages: Math.ceil(total / 10),
          };
        });
      }
    }
    if (notification.link) navigate(notification.link);
  };

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setUnreadCount(0);
      if (readState === "unread") {
        await loadHistory();
      } else {
        setItems((current) =>
          current.map((item) => ({
            ...item,
            readAt: item.readAt || new Date().toISOString(),
          }))
        );
      }
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc");
    } catch (error) {
      toast.error(error.message || "Không thể cập nhật thông báo");
    }
  };

  const updatePreference = (channel, notificationType, enabled) => {
    setPreferences((current) => ({
      ...current,
      [channel]: { ...current[channel], [notificationType]: Boolean(enabled) },
    }));
  };

  const savePreferences = async () => {
    setSavingPreferences(true);
    try {
      const response = await notificationsAPI.updatePreferences(preferences);
      setPreferences(response.data?.preferences || preferences);
      toast.success("Đã lưu tùy chọn thông báo");
    } catch (error) {
      toast.error(error.message || "Không thể lưu tùy chọn thông báo");
    } finally {
      setSavingPreferences(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-h2 font-display font-bold text-foreground">
            Trung tâm thông báo
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Xem lại cập nhật về đơn hàng, thanh toán và các hoạt động của bạn.
          </p>
        </div>
        <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
          <CheckCheck className="size-4" />
          Đọc tất cả {unreadCount > 0 ? `(${unreadCount})` : ""}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <Select value={type} onValueChange={changeFilter(setType)}>
            <SelectTrigger className="sm:w-56" aria-label="Lọc loại thông báo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại</SelectItem>
              {Object.entries(TYPE_CONFIG).map(([value, config]) => (
                <SelectItem key={value} value={value}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={readState} onValueChange={changeFilter(setReadState)}>
            <SelectTrigger className="sm:w-48" aria-label="Lọc trạng thái đọc">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="unread">Chưa đọc</SelectItem>
              <SelectItem value="read">Đã đọc</SelectItem>
            </SelectContent>
          </Select>
          <span className="self-center text-sm text-muted-foreground/70 sm:ml-auto">
            {pagination.total || 0} thông báo
          </span>
        </div>

        {loading ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Đang tải...</p>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="mx-auto size-9 text-muted-foreground/60" />
            <p className="mt-3 font-semibold text-foreground">Không có thông báo phù hợp</p>
            <p className="mt-1 text-sm text-muted-foreground/70">Thử thay đổi bộ lọc để xem lịch sử khác.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((notification) => {
              const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;
              const Icon = config.icon;
              return (
                <button
                  key={notification._id || notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={cn(
                    "flex w-full items-start gap-3 p-4 text-left transition hover:bg-muted",
                    !notification.readAt && "bg-primary-50/40"
                  )}
                >
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", config.color)}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-foreground">{notification.title}</strong>
                      {!notification.readAt && <Badge variant="info">Mới</Badge>}
                    </span>
                    {notification.message && (
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {notification.message}
                      </span>
                    )}
                    <span className="mt-1.5 block text-xs text-muted-foreground/70">
                      {config.label} · {formatDateTimeVN(notification.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          totalPages={pagination.totalPages}
          onChange={setPage}
          disabled={loading}
          className="border-t border-border p-4"
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 border-b border-border p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Settings className="size-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Tùy chọn nhận thông báo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Email giao dịch được bật mặc định; bạn vẫn có thể điều chỉnh từng nhóm.
            </p>
          </div>
        </div>

        {!emailVerified && (
          <div className="m-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-muted p-3 text-sm text-warning-strong">
            <Mail className="mt-0.5 size-4 shrink-0" />
            Xác minh email trong trang Tổng quan để bật kênh email.
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[1fr_130px_110px] border-b bg-muted px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Nội dung</span>
              <span>Trong ứng dụng</span>
              <span>Email</span>
            </div>
            {Object.entries(TYPE_CONFIG).map(([notificationType, config]) => (
              <div key={notificationType} className="grid grid-cols-[1fr_130px_110px] items-center border-b border-border px-5 py-3 last:border-0">
                <span className="text-sm font-medium text-foreground">{config.label}</span>
                <Checkbox
                  aria-label={`Nhận ${config.label} trong ứng dụng`}
                  checked={Boolean(preferences.inApp?.[notificationType])}
                  disabled={preferencesLoading}
                  onCheckedChange={(checked) => updatePreference("inApp", notificationType, checked)}
                />
                <Checkbox
                  aria-label={`Nhận ${config.label} qua email`}
                  checked={Boolean(preferences.email?.[notificationType])}
                  disabled={preferencesLoading || !emailVerified}
                  onCheckedChange={(checked) => updatePreference("email", notificationType, checked)}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end border-t border-border p-4">
          <Button onClick={savePreferences} loading={preferencesLoading || savingPreferences}>
            <Save className="size-4" />
            {savingPreferences ? "Đang lưu..." : "Lưu tùy chọn"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
