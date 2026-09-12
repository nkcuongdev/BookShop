import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Store, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext.jsx";

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.name || "A").charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group inline-flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <Avatar className="size-8">
          {user?.avatar && <AvatarImage src={user.avatar} />}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="hidden text-left md:block">
          <p className="text-sm font-semibold leading-tight text-foreground">
            {user?.name || "Admin"}
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {user?.email || "admin@bookshop.local"}
          </p>
        </div>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Tài khoản</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => navigate("/profile")}>
          <UserRound className="size-4" />
          Hồ sơ cá nhân
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/")}>
          <Store className="size-4" />
          Về cửa hàng
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
