import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext.jsx";
import { roleLabel } from "@/lib/rbac";

/**
 * Shown inside the admin shell when a staff member opens a page their role does
 * not cover — reached by typing a URL, or following a stale link.
 */
export default function AdminForbidden() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldAlert className="size-8" />
      </div>
      <div className="max-w-md">
        <h1 className="text-h2 font-display font-bold text-foreground">
          Bạn không có quyền truy cập trang này
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tài khoản của bạn đang ở vai trò{" "}
          <span className="font-medium text-foreground">{roleLabel(user)}</span>. Nếu
          bạn cần dùng chức năng này, hãy liên hệ quản trị viên để được cấp quyền.
        </p>
      </div>
      <Button asChild>
        <Link to="/admin">Về trang tổng quan</Link>
      </Button>
    </div>
  );
}
