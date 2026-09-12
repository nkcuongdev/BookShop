import { NavLink, Link, useLocation } from "react-router-dom";
import { BookOpen, ChevronLeft } from "lucide-react";
import { visibleNav, itemMatches } from "./navConfig";
import { useStockValuation } from "@/features/admin/inventory/hooks";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export function AdminSidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const groups = visibleNav(user);
  // The valuation endpoint already returns the low-stock count, so the badge
  // rides along on a query the inventory screens share. Staff without stock
  // access would only get a 403 from it.
  const valuationQ = useStockValuation({ enabled: can(user, "inventory.read") });
  const badgeCounts = { lowStock: valuationQ.data?.lowStockCount || 0 };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen flex-col border-r border-border bg-card lg:flex transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-primary-glow">
            <BookOpen className="size-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-foreground">
                BookShop
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Admin Panel
              </p>
            </div>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={onToggle}
          aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
        >
          <ChevronLeft
            className={cn("size-4 transition-transform", collapsed && "rotate-180")}
          />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.group} className="mb-4">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.group}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                      itemMatches(item, pathname)
                        ? "bg-primary-50 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      collapsed && "justify-center px-0"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.badge && badgeCounts[item.badge] > 0 && (
                          <span className="ml-auto rounded-full bg-warning-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warning-strong">
                            {badgeCounts[item.badge]}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

    </aside>
  );
}
