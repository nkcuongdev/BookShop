import { NavLink, useLocation } from "react-router-dom";
import { Home, Search, ShoppingCart, Heart, User } from "lucide-react";
import { useCart } from "@/context/CartContext.jsx";
import useWishlist from "@/hooks/useWishlist";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "Trang chủ", icon: Home, end: true },
  { to: "/products", label: "Khám phá", icon: Search },
  { to: "/cart", label: "Giỏ", icon: ShoppingCart, badge: "cart" },
  { to: "/profile/wishlist", label: "Yêu thích", icon: Heart, badge: "wish" },
  { to: "/profile", label: "Tôi", icon: User },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const { totalItems } = useCart();
  const { items: wishlist } = useWishlist();

  const hiddenPaths = ["/checkout", "/login", "/register"];
  if (hiddenPaths.some((p) => location.pathname.startsWith(p))) return null;

  const cartCount = totalItems || 0;
  const wishCount = wishlist?.length || 0;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const badgeValue =
            item.badge === "cart"
              ? cartCount
              : item.badge === "wish"
              ? wishCount
              : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors relative",
                  isActive
                    ? "text-primary-600"
                    : "text-secondary-500 hover:text-secondary-700"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <item.icon
                      className={cn(
                        "w-5 h-5 transition-transform",
                        isActive && "scale-110"
                      )}
                    />
                    {badgeValue > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {badgeValue > 9 ? "9+" : badgeValue}
                      </span>
                    )}
                  </div>
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-primary-500" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
