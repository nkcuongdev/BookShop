import { Link } from "react-router-dom";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMyPermissions } from "@/features/admin/roles/hooks";
import { can } from "@/lib/rbac";
import { useAuth } from "@/context/AuthContext.jsx";

const WILDCARD = "*";

/**
 * What the signed-in staff member may do, in plain language.
 *
 * Lives under /profile rather than /admin so it stays reachable regardless of
 * which permissions the person holds — the whole point is to explain why a menu
 * is missing, and that answer must not itself be behind a permission.
 */
export default function MyPermissions() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useMyPermissions();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert
        intent="danger"
        title="Không tải được thông tin quyền"
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        }
      >
        Vui lòng thử lại sau.
      </Alert>
    );
  }

  const granted = new Set(data?.permissions || []);
  const hasAll = granted.has(WILDCARD);
  const groups = data?.groups || [];

  // Only the groups where this person actually holds something.
  const heldGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAll || granted.has(item.key)),
    }))
    .filter((group) => group.items.length > 0);

  const totalHeld = hasAll
    ? groups.reduce((sum, group) => sum + group.items.length, 0)
    : granted.size;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {data?.roleLabel || "Khách hàng"}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data?.roleDescription ||
                  (data?.isStaff
                    ? "Vai trò nhân viên."
                    : "Tài khoản mua hàng, không có quyền quản trị.")}
              </p>
            </div>
          </div>

          {data?.isStaff && (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin">Vào khu quản trị</Link>
            </Button>
          )}
        </div>
      </Card>

      {!data?.isStaff ? (
        <Alert intent="info" title="Bạn đang dùng tài khoản khách hàng">
          Tài khoản này không có quyền quản trị. Nếu bạn là nhân viên và cần truy cập
          khu quản trị, hãy liên hệ quản trị viên để được gán vai trò.
        </Alert>
      ) : (
        <>
          <Card className="p-5">
            <h2 className="text-base font-semibold text-foreground">
              Bạn được phép làm gì
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {hasAll
                ? "Bạn có toàn quyền trên hệ thống."
                : `${totalHeld} quyền, theo từng nhóm nghiệp vụ.`}
            </p>

            <div className="mt-5 space-y-5">
              {heldGroups.map((group) => (
                <section key={group.group}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.group}
                  </h3>
                  <ul className="space-y-2">
                    {group.items.map((item) => (
                      <li key={item.key} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-success-strong" />
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            {item.label}
                            {item.sensitive && (
                              <AlertTriangle className="size-3.5 shrink-0 text-warning-strong" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>

          <Alert intent="info" title="Cần thêm quyền?">
            Quyền được cấp theo vai trò, không cấp lẻ cho từng người. Nếu bạn thiếu
            quyền cho công việc của mình, hãy liên hệ quản trị viên để được đổi vai
            trò hoặc điều chỉnh quyền của vai trò hiện tại.
            {can(user, "role.read") && (
              <>
                {" "}
                <Link to="/admin/roles" className="font-medium underline">
                  Xem ma trận vai trò
                </Link>
                .
              </>
            )}
          </Alert>
        </>
      )}
    </div>
  );
}
