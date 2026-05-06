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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { ordersAPI } from "@/services/api";
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
      className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-primary-300 hover:shadow-md transition-all"
    >
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <p className="mt-3 text-2xl font-bold text-secondary-800">{value}</p>
      <p className="text-sm text-secondary-500">{label}</p>
    </Link>
  );
}

export default function ProfileOverview() {
  const { user, updateProfile } = useAuth();
  const { items: wishlist } = useWishlist();
  const [orders, setOrders] = useState([]);
  const [addressCount, setAddressCount] = useState(0);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "" });

  useEffect(() => {
    ordersAPI
      .getMyOrders()
      .then((res) => setOrders(res?.data?.orders || []))
      .catch(() => setOrders([]));
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

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
    });
  }, [user]);

  const spend = orders.reduce((sum, o) => {
    if (o.status !== "DELIVERED") return sum;
    return sum + (o.totalAmount || 0);
  }, 0);

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      toast.error("Vui lòng nhập đầy đủ họ tên và email");
      return;
    }

    setIsSavingProfile(true);
    const result = await updateProfile({
      name: profileForm.name.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim(),
    });
    setIsSavingProfile(false);

    if (!result.success) {
      toast.error(result.error || "Không thể cập nhật thông tin");
      return;
    }

    toast.success("Đã cập nhật thông tin cá nhân");
    setIsEditingProfile(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Package}
          label="Đơn hàng"
          value={orders.length}
          to="/profile/orders"
          color="bg-primary-50 text-primary-600"
        />
        <StatCard
          icon={Heart}
          label="Yêu thích"
          value={wishlist.length}
          to="/profile/wishlist"
          color="bg-red-50 text-red-500"
        />
        <StatCard
          icon={ShoppingBag}
          label="Đã chi"
          value={formatVND(spend)}
          to="/profile/orders"
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          icon={MapPin}
          label="Địa chỉ"
          value={addressCount}
          to="/profile/addresses"
          color="bg-sky-50 text-sky-600"
        />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold text-secondary-800">
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
                disabled={isSavingProfile}
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
              <p className="text-sm text-secondary-600 mb-1.5">Họ và tên</p>
              <Input
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Nhập họ và tên"
              />
            </div>
            <div>
              <p className="text-sm text-secondary-600 mb-1.5">Email</p>
              <Input
                type="email"
                value={profileForm.email}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Nhập email"
              />
            </div>
            <div>
              <p className="text-sm text-secondary-600 mb-1.5">Số điện thoại</p>
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
          <dl className="divide-y divide-gray-100">
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
                <row.icon className="w-4 h-4 text-secondary-400" />
                <dt className="text-sm text-secondary-500">{row.label}</dt>
                <dd className="text-sm font-medium text-secondary-800">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-bold text-secondary-800">
            Đơn hàng gần đây
          </h2>
          <Button variant="link" size="sm" asChild>
            <Link to="/profile/orders">Xem tất cả</Link>
          </Button>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-secondary-500 text-center py-6">
            Bạn chưa có đơn hàng nào.
          </p>
        ) : (
          <div className="space-y-2">
            {orders.slice(0, 3).map((o) => (
              <Link
                key={o._id}
                to="/profile/orders"
                className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-secondary-800">
                    Đơn #{o._id?.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-xs text-secondary-500">
                    {new Date(o.createdAt).toLocaleDateString("vi-VN")} ·{" "}
                    {o.items?.length || 0} sản phẩm
                  </p>
                </div>
                <p className="font-bold text-primary-600">
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
