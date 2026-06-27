import { Fragment } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Lock,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useDeleteRole,
  usePermissionCatalog,
  useRoles,
} from "@/features/admin/roles/hooks";

const WILDCARD = "*";

const holds = (role, permission) =>
  role.permissions.includes(WILDCARD) || role.permissions.includes(permission);

/**
 * Roles × permissions, side by side. This is the read view: it answers "who can
 * do what" at a glance, which the user-by-user list never could.
 */
export default function RolesMatrix() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const rolesQ = useRoles();
  const catalogQ = usePermissionCatalog();
  const deleteRole = useDeleteRole();

  const roles = rolesQ.data || [];
  const groups = catalogQ.data?.groups || [];
  const isLoading = rolesQ.isLoading || catalogQ.isLoading;

  const handleDelete = async (role) => {
    const ok = await confirm({
      title: `Xoá vai trò "${role.label}"?`,
      description:
        role.userCount > 0
          ? `Còn ${role.userCount} tài khoản đang giữ vai trò này. Hãy chuyển họ sang vai trò khác trước.`
          : "Vai trò này sẽ bị xoá vĩnh viễn.",
      confirmText: "Xoá",
      variant: "destructive",
    });
    if (ok) deleteRole.mutate(role.key);
  };

  if (rolesQ.isError || catalogQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vai trò & quyền hạn" />
        <ErrorState
          onRetry={() => {
            rolesQ.refetch();
            catalogQ.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vai trò & quyền hạn"
        description="Mỗi vai trò là một tập quyền. Nhân viên được gán vai trò, không gán quyền lẻ."
        actions={
          <PermissionGate permission="role.manage">
            <Button onClick={() => navigate("/admin/roles/new")}>
              <Plus className="size-4" />
              Thêm vai trò
            </Button>
          </PermissionGate>
        }
      />

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <SectionCard
          title="Ma trận phân quyền"
          description="Cột là vai trò, hàng là quyền. Quyền có dấu ⚠ là quyền nhạy cảm."
          icon={ShieldCheck}
          bodyClassName="p-0"
        >
          {/* Wide table: scrolls inside itself so the page never scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 min-w-[280px] bg-card px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quyền
                  </th>
                  {roles.map((role) => (
                    <th
                      key={role.key}
                      className="min-w-[150px] border-l border-border px-3 py-3 align-top"
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-center font-semibold text-foreground">
                          {role.label}
                        </span>

                        <Link
                          to={`/admin/users?role=${role.key === "user" ? "customer" : role.key}`}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground hover:text-foreground"
                        >
                          <Users className="size-3" />
                          {role.userCount}
                        </Link>

                        <div className="flex items-center gap-1">
                          {role.isLocked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground/70">
                                  <Lock className="size-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Vai trò cố định, không thể sửa quyền
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <PermissionGate permission="role.manage">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`Sửa ${role.label}`}
                                onClick={() => navigate(`/admin/roles/${role.key}`)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              {!role.isSystem && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-danger-strong hover:bg-danger-muted"
                                  aria-label={`Xoá ${role.label}`}
                                  onClick={() => handleDelete(role)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </PermissionGate>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.group}>
                    <tr className="bg-muted/60">
                      <td
                        colSpan={roles.length + 1}
                        className="sticky left-0 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {group.group}
                      </td>
                    </tr>
                    {group.items.map((item) => (
                      <tr
                        key={item.key}
                        className="border-b border-border last:border-0 hover:bg-muted/40"
                      >
                        <td className="sticky left-0 z-10 bg-card px-5 py-2.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help items-center gap-1.5 text-foreground">
                                {item.label}
                                {item.sensitive && (
                                  <AlertTriangle className="size-3.5 text-warning-strong" />
                                )}
                                {item.adminOnly && (
                                  <Lock className="size-3 text-muted-foreground/70" />
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {item.description}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        {roles.map((role) => (
                          <td
                            key={role.key}
                            className="border-l border-border px-3 py-2.5 text-center"
                          >
                            {holds(role, item.key) ? (
                              <Check
                                className="mx-auto size-4 text-success-strong"
                                aria-label="Có quyền"
                              />
                            ) : (
                              <Minus
                                className="mx-auto size-4 text-muted-foreground/30"
                                aria-label="Không có quyền"
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
