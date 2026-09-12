import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Heart,
  MapPin,
  ShoppingBag,
  Mail,
  User,
  Phone,
  BadgeCheck,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { ordersAPI } from "@/services/api";
import { useMyLoyalty } from "@/features/loyalty/hooks";
import useWishlist from "@/hooks/useWishlist";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { authAPI } from "@/services/api";
import { formatVND } from "@/utils/format";

function StatCard({ icon: Icon, label, value, to, color }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl bg-card p-5 ring-1 ring-foreground/[0.06] shadow-rest transition-[box-shadow,transform,--tw-ring-color] duration-base ease-out-soft hover:ring-primary/25 hover:shadow-lift hover:-translate-y-0.5"
    >
      <div
        className={`size-11 rounded-xl flex items-center justify-center ${color}`}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Link>
  );
}

export default function ProfileOverview() {
  const { data: loyalty } = useMyLoyalty();
  const { user, updateProfile } = useAuth();
  const { items: wishlist } = useWishlist();
  const [orders, setOrders] = useState([]);
  const [orderSummary, setOrderSummary] = useState({ totalOrders: 0, totalSpend: 0 });
  const [addressCount, setAddressCount] = useState(0);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const profileVersion = [
    user?._id || user?.id || "anonymous",
    user?.name || "",
    user?.email || "",
    user?.phone || "",
  ].join("|");
  const initialProfileForm = {
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    currentPassword: "",
  };
  const [profileDraft, setProfileDraft] = useState({
    version: profileVersion,
    values: initialProfileForm,
  });
  const profileForm =
    profileDraft.version === profileVersion
      ? profileDraft.values
      : initialProfileForm;
  const setProfileForm = (updater) => {
    setProfileDraft((current) => {
      const currentValues =
        current.version === profileVersion ? current.values : initialProfileForm;
      return {
        version: profileVersion,
        values:
          typeof updater === "function" ? updater(currentValues) : updater,
      };
    });
  };
  const emailChangeRequested =
    profileForm.email.trim().toLowerCase() !==
    String(user?.email || "").trim().toLowerCase();

  useEffect(() => {
    ordersAPI
      .getMyOrders({ page: 1, limit: 3 })
      .then((res) => {
        setOrders(res?.data?.orders || []);
        setOrderSummary(res?.data?.summary || { totalOrders: 0, totalSpend: 0 });
      })
      .catch(() => {
        setOrders([]);
        setOrderSummary({ totalOrders: 0, totalSpend: 0 });
      });
  }, []);

  useEffect(() => {
    let active = true;
    const loadAddressCount = async () => {
      try {
        const res = await authAPI.getAddresses();
        if (active && res.success) {
          setAddressCount((res?.data?.addresses || []).length);
        }
      } catch {
        if (active) setAddressCount(0);
      }
    };

    loadAddressCount();
    window.addEventListener("focus", loadAddressCount);
    return () => {
      active = false;
      window.removeEventListener("focus", loadAddressCount);
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      toast.error("Vui lòng nhập đầy đủ họ tên và email");
      return;
    }
    if (emailChangeRequested && !profileForm.currentPassword) {
      toast.error("Vui lòng nhập mật khẩu hiện tại để đổi email");
      return;
    }

    setIsSavingProfile(true);
    const result = await updateProfile({
      name: profileForm.name.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim(),
      ...(emailChangeRequested
        ? { currentPassword: profileForm.currentPassword }
        : {}),
    });
    setIsSavingProfile(false);

    if (!result.success) {
      toast.error(result.error || "Không thể cập nhật thông tin");
      return;
    }

    toast.success(result.message || "Đã cập nhật thông tin cá nhân");
    if (result.verificationUrl) {
      window.location.assign(result.verificationUrl);
      return;
    }
    setIsEditingProfile(false);
  };

  const handleSendVerification = async () => {
    setIsSendingVerification(true);
    try {
      const response = await authAPI.requestEmailVerification();
      if (response.data?.verificationUrl) {
        window.location.assign(response.data.verificationUrl);
        return;
      }
      toast.success(response.message || "Đã gửi email xác minh");
    } catch (error) {
      toast.error(error.message || "Không thể gửi email xác minh");
    } finally {
      setIsSendingVerification(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={Package}
          label="Đơn hàng"
          value={orderSummary.totalOrders}
          to="/profile/orders"
          color="bg-primary-50 text-primary"
        />
        <StatCard
          icon={Heart}
          label="Yêu thích"
          value={wishlist.length}
          to="/profile/wishlist"
          color="bg-danger-muted text-danger-strong"
        />
        <StatCard
          icon={ShoppingBag}
          label="Đã chi"
          value={formatVND(orderSummary.totalSpend)}
          to="/profile/orders"
          color="bg-success-muted text-success-strong"
        />
        <StatCard
          icon={Sparkles}
          label="Điểm thưởng"
          value={(loyalty?.balance ?? 0).toLocaleString("vi-VN")}
          to="/profile/points"
          color="bg-warning-muted text-warning-strong"
        />
        <StatCard
          icon={MapPin}
          label="Địa chỉ"
          value={addressCount}
          to="/profile/addresses"
          color="bg-info-muted text-info-strong"
        />
      </div>

      <Card className="p-6">
        {user.pendingEmail && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-info/30 bg-info-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 size-5 shrink-0 text-info-strong" />
              <div>
                <p className="text-sm font-semibold text-info-strong">
                  Đang chờ xác minh email mới
                </p>
                <p className="mt-0.5 text-sm text-info-strong">
                  {user.pendingEmail} chỉ trở thành email đăng nhập sau khi xác minh.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendVerification}
              loading={isSendingVerification}
            >
              {isSendingVerification ? "Đang gửi..." : "Gửi lại liên kết"}
            </Button>
          </div>
        )}
        {!user.emailVerified && !user.pendingEmail && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-warning-strong" />
              <div>
                <p className="text-sm font-semibold text-warning-strong">Email chưa được xác minh</p>
                <p className="mt-0.5 text-sm text-warning-strong">
                  Xác minh email để có thể khôi phục tài khoản an toàn.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendVerification}
              loading={isSendingVerification}
            >
              {isSendingVerification ? "Đang gửi..." : "Gửi email xác minh"}
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-h3 font-display font-bold text-foreground">
            Thông tin cá nhân
          </h2>
          {isEditingProfile ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setProfileForm({
                    name: user?.name || "",
                    email: user?.email || "",
                    phone: user?.phone || "",
                    currentPassword: "",
                  });
                  setIsEditingProfile(false);
                }}
                disabled={isSavingProfile}
              >
                Hủy
              </Button>
              <Button
                size="sm"
                onClick={handleSaveProfile}
                loading={isSavingProfile}
              >
                {isSavingProfile ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)}>
              Chỉnh sửa
            </Button>
          )}
        </div>
        {isEditingProfile ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Họ và tên</p>
              <Input
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Nhập họ và tên"
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Email</p>
              <Input
                type="email"
                value={profileForm.email}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Nhập email"
              />
            </div>
            {emailChangeRequested && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <KeyRound className="size-4" />
                  Mật khẩu hiện tại
                </p>
                <Input
                  type="password"
                  value={profileForm.currentPassword}
                  onChange={(event) =>
                    setProfileForm((previous) => ({
                      ...previous,
                      currentPassword: event.target.value,
                    }))
                  }
                  placeholder="Xác thực trước khi đổi email"
                  autoComplete="current-password"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Email hiện tại vẫn dùng để đăng nhập cho đến khi email mới được xác minh.
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Số điện thoại</p>
              <Input
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="Nhập số điện thoại"
                inputMode="tel"
              />
            </div>
          </div>
        ) : (
          <dl className="divide-y divide-border">
            {[
              { icon: User, label: "Họ và tên", value: user.name },
              { icon: Mail, label: "Email", value: user.email },
              {
                icon: Phone,
                label: "Số điện thoại",
                value: user.phone || "Chưa cập nhật",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[24px_120px_1fr] items-center gap-3 py-3"
              >
                <row.icon className="size-4 text-muted-foreground/70" />
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-medium text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 font-display font-bold text-foreground">
            Đơn hàng gần đây
          </h2>
          <Button variant="link" size="sm" asChild>
            <Link to="/profile/orders">Xem tất cả</Link>
          </Button>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Bạn chưa có đơn hàng nào.
          </p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <Link
                key={o._id}
                to="/profile/orders"
                className="flex items-center justify-between p-3 rounded-xl hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Đơn #{o._id?.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString("vi-VN")} ·{" "}
                    {o.items?.length || 0} sản phẩm
                  </p>
                </div>
                <p className="font-bold text-primary">
                  {formatVND(o.totalAmount)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
