import { NavLink, Navigate, Outlet } from "react-router-dom";
import {
  User,
  Package,
  MapPin,
  Heart,
  KeyRound,
  Bell,
  Headphones,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { isStaff } from "@/lib/rbac";

const TABS = [
  { to: "/profile", label: "Tổng quan", icon: User, end: true },
  { to: "/profile/orders", label: "Đơn hàng", icon: Package },
  { to: "/profile/points", label: "Điểm thưởng", icon: Sparkles },
  { to: "/profile/addresses", label: "Địa chỉ", icon: MapPin },
  { to: "/profile/wishlist", label: "Yêu thích", icon: Heart },
  { to: "/profile/notifications", label: "Thông báo", icon: Bell },
  { to: "/profile/support", label: "Yêu cầu hỗ trợ", icon: Headphones },
  { to: "/profile/password", label: "Đổi mật khẩu", icon: KeyRound },
  // Staff only: explains which admin areas they can reach, and why.
  {
    to: "/profile/permissions",
    label: "Quyền của tôi",
    icon: ShieldCheck,
    staffOnly: true,
  },
];

export default function ProfileLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center text-muted-foreground"
        role="status"
      >
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (!user) return <Navigate to="/login?redirect=/profile" replace />;

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-br from-primary-800 to-deep-soft text-deep-foreground">
        <div className="page-container py-8 flex items-center gap-4">
          <Avatar className="size-16 ring-4 ring-white/30">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-xl">
              {user.name?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70 font-semibold">
              Xin chào
            </p>
            <h1 className="text-h2 lg:text-h1 font-display font-bold">
              {user.name}
            </h1>
            <p className="text-sm text-white/80">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="page-container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          <aside>
            <Card className="p-2 sticky top-24">
              <nav className="space-y-0.5">
                {TABS.filter((t) => !t.staffOnly || isStaff(user)).map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary"
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <t.icon className="size-4" />
                    <span className="flex-1">{t.label}</span>
                    <ChevronRight className="size-4 opacity-30" />
                  </NavLink>
                ))}
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-danger-strong hover:bg-danger-muted transition-colors"
                >
                  <LogOut className="size-4" />
                  Đăng xuất
                </button>
              </nav>
            </Card>
          </aside>

          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
