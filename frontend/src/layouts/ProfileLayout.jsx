import { NavLink, Navigate, Outlet } from "react-router-dom";
import {
  User,
  Package,
  MapPin,
  Heart,
  KeyRound,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/profile", label: "Tổng quan", icon: User, end: true },
  { to: "/profile/orders", label: "Đơn hàng", icon: Package },
  { to: "/profile/addresses", label: "Địa chỉ", icon: MapPin },
  { to: "/profile/wishlist", label: "Yêu thích", icon: Heart },
  { to: "/profile/password", label: "Đổi mật khẩu", icon: KeyRound },
];

export default function ProfileLayout() {
  const { user, logout } = useAuth();

  if (!user) return <Navigate to="/login?redirect=/profile" replace />;

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center gap-4">
          <Avatar className="w-16 h-16 ring-4 ring-white/30">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-xl">
              {user.name?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70 font-semibold">
              Xin chào
            </p>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">
              {user.name}
            </h1>
            <p className="text-sm text-white/80">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          <aside>
            <Card className="p-2 sticky top-24">
              <nav className="space-y-0.5">
                {TABS.map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary-50 text-primary-700"
                          : "text-secondary-700 hover:bg-gray-50"
                      )
                    }
                  >
                    <t.icon className="w-4 h-4" />
                    <span className="flex-1">{t.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-30" />
                  </NavLink>
                ))}
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
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
