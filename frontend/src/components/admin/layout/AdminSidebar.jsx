import { NavLink, Link } from "react-router-dom";
import { BookOpen, ChevronLeft } from "lucide-react";
import { ADMIN_NAV } from "./navConfig";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminSidebar({ collapsed, onToggle }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen flex-col border-r border-gray-100 bg-white lg:flex transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25">
            <BookOpen className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-secondary-900">
                BookShop
              </p>
              <p className="truncate text-[11px] text-secondary-500">
                Admin Panel
              </p>
            </div>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-secondary-500"
          onClick={onToggle}
          aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
        >
          <ChevronLeft
            className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")}
          />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {ADMIN_NAV.map((group) => (
          <div key={group.group} className="mb-4">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-secondary-400">
                {group.group}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                        isActive
                          ? "bg-primary-50 text-primary-700"
                          : "text-secondary-600 hover:bg-gray-50 hover:text-secondary-900",
                        collapsed && "justify-center px-0"
                      )
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
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
