import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext.jsx";
import {
  useCreateRole,
  usePermissionCatalog,
  useRoles,
  useUpdateRole,
} from "@/features/admin/roles/hooks";

/** Derive a role key from its name, so the admin rarely has to think about it. */
const suggestKey = (label) =>
  label
    .normalize("NFD")
    // Explicit escapes: a literal combining-mark range is invisible in an editor.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 32);

/**
 * Waits for the role and catalogue before mounting the editor, so the form can
 * seed its state straight from props rather than syncing in an effect.
 */
export default function RoleFormPage({ mode = "edit" }) {
  const isCreate = mode === "create";
  const { key } = useParams();
  const navigate = useNavigate();

  const rolesQ = useRoles();
  const catalogQ = usePermissionCatalog();

  if (rolesQ.isError || catalogQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vai trò" />
        <ErrorState
          onRetry={() => {
            rolesQ.refetch();
            catalogQ.refetch();
          }}
        />
      </div>
    );
  }

  if (rolesQ.isLoading || catalogQ.isLoading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  const role = isCreate ? null : rolesQ.data?.find((r) => r.key === key);

  if (!isCreate && !role) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vai trò" />
        <Alert intent="danger" title="Không tìm thấy vai trò">
          Vai trò &quot;{key}&quot; không tồn tại hoặc đã bị xoá.
        </Alert>
        <Button variant="outline" onClick={() => navigate("/admin/roles")}>
          <ArrowLeft className="size-4" />
          Về danh sách vai trò
        </Button>
      </div>
    );
  }

  return (
    <RoleEditor
      // Remount when the loaded role changes, re-seeding the form state.
      key={role?.key || "new"}
      role={role}
      isCreate={isCreate}
      roles={rolesQ.data || []}
      groups={catalogQ.data?.groups || []}
      adminOnly={catalogQ.data?.adminOnly || []}
    />
  );
}

function RoleEditor({ role, isCreate, roles, groups, adminOnly }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const key = role?.key;
  const [form, setForm] = useState({
    key: role?.key || "",
    label: role?.label || "",
    description: role?.description || "",
  });
  const [selected, setSelected] = useState(new Set(role?.permissions || []));
  const [copyFrom, setCopyFrom] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);

  const isSelfRole = !isCreate && user?.role === key;
  const editing = !isCreate;
  const isLocked = Boolean(role?.isLocked);
  const saving = createRole.isPending || updateRole.isPending;

  const toggle = (permission) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const toggleGroup = (group, on) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of group.items) {
        if (adminOnly.includes(item.key)) continue;
        if (on) next.add(item.key);
        else next.delete(item.key);
      }
      return next;
    });
  };

  const applyCopy = (sourceKey) => {
    setCopyFrom(sourceKey);
    const source = roles.find((r) => r.key === sourceKey);
    if (!source) return;
    // The wildcard is not a grantable value; copying admin yields nothing.
    setSelected(new Set(source.permissions.filter((p) => p !== "*")));
  };

  const permissions = useMemo(() => [...selected], [selected]);

  // The API refuses these too; warning here saves a round trip and explains why.
  const losesAccess = editing && isSelfRole && !selected.has("admin.access");
  const losesManage = editing && isSelfRole && !selected.has("role.manage");
  const noAdminAccess = !selected.has("admin.access");

  const submit = (event) => {
    event.preventDefault();
    if (isCreate) {
      createRole.mutate(
        {
          key: form.key || suggestKey(form.label),
          label: form.label,
          description: form.description,
          permissions,
        },
        { onSuccess: () => navigate("/admin/roles") }
      );
    } else {
      updateRole.mutate(
        {
          key,
          data: {
            label: form.label,
            description: form.description,
            permissions,
          },
        },
        { onSuccess: () => navigate("/admin/roles") }
      );
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader
        title={isCreate ? "Thêm vai trò" : `Sửa vai trò: ${role.label}`}
        description={
          isCreate
            ? "Đặt tên vai trò và chọn những quyền nhân viên ở vai trò này được dùng."
            : `${role.userCount} tài khoản đang giữ vai trò này.`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/roles")}
            >
              Huỷ
            </Button>
            <Button type="submit" loading={saving} disabled={isLocked}>
              {isCreate ? "Tạo vai trò" : "Lưu thay đổi"}
            </Button>
          </div>
        }
      />

      {isLocked && (
        <Alert intent="info" icon={Lock} title="Vai trò cố định">
          Không thể thay đổi quyền của vai trò này. Quản trị viên luôn có toàn quyền,
          và khách hàng luôn không có quyền quản trị — nếu sửa được thì hệ thống có
          thể tự khoá chính nó.
        </Alert>
      )}

      {losesAccess && (
        <Alert intent="danger" title="Bạn sẽ mất quyền vào khu quản trị">
          Đây là vai trò bạn đang dùng. Bỏ quyền &quot;Vào khu quản trị&quot; sẽ khiến
          bạn không thể quay lại trang này. Hệ thống sẽ từ chối lưu.
        </Alert>
      )}

      {!losesAccess && losesManage && (
        <Alert intent="danger" title="Bạn sẽ mất quyền sửa vai trò">
          Đây là vai trò bạn đang dùng. Bỏ quyền &quot;Sửa vai trò &amp; quyền&quot; sẽ
          khiến bạn không thể chỉnh phân quyền nữa. Hệ thống sẽ từ chối lưu.
        </Alert>
      )}

      {!isLocked && !isSelfRole && noAdminAccess && (
        <Alert intent="warning" title="Vai trò này chưa vào được khu quản trị">
          Thiếu quyền &quot;Vào khu quản trị&quot; thì mọi quyền khác đều không dùng
          được. Hãy tích quyền đó nếu đây là vai trò nhân viên.
        </Alert>
      )}

      <SectionCard title="Thông tin vai trò" icon={ShieldCheck}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="role-label"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Tên vai trò
            </label>
            <Input
              id="role-label"
              value={form.label}
              maxLength={60}
              required
              disabled={isLocked}
              placeholder="Ví dụ: Trưởng kho"
              onChange={(event) => {
                const label = event.target.value;
                setForm((current) => ({
                  ...current,
                  label,
                  // Only auto-fill the key until the admin types their own.
                  key:
                    isCreate && !keyEdited ? suggestKey(label) : current.key,
                }));
              }}
            />
          </div>

          <div>
            <label
              htmlFor="role-key"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Mã vai trò
            </label>
            <Input
              id="role-key"
              value={form.key}
              maxLength={32}
              required
              // The key is stored on every user holding the role, so changing it
              // later would orphan those accounts.
              disabled={!isCreate}
              placeholder="truongkho"
              onChange={(event) => {
                setKeyEdited(true);
                setForm((current) => ({
                  ...current,
                  key: event.target.value.toLowerCase(),
                }));
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {isCreate
                ? "Chữ thường, số, gạch ngang. Không đổi được sau khi tạo."
                : "Không thể đổi mã của vai trò đã tạo."}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="role-description"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Mô tả
            </label>
            <Textarea
              id="role-description"
              value={form.description}
              maxLength={300}
              rows={2}
              disabled={isLocked}
              placeholder="Vai trò này phụ trách việc gì?"
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>

          {isCreate && (
            <div className="sm:col-span-2">
              <label
                htmlFor="role-copy"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Sao chép quyền từ vai trò có sẵn
              </label>
              <Select value={copyFrom} onValueChange={applyCopy}>
                <SelectTrigger id="role-copy" className="w-full sm:w-[280px]">
                  <SelectValue placeholder="Chọn vai trò để sao chép..." />
                </SelectTrigger>
                <SelectContent>
                  {roles
                    .filter((r) => !r.isLocked)
                    .map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Chọn rồi chỉnh tiếp bên dưới, nhanh hơn tích lại từ đầu.
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Quyền hạn"
        description={`Đã chọn ${selected.size} quyền. Quyền có ⚠ là quyền nhạy cảm; quyền có 🔒 chỉ dành cho quản trị viên.`}
        icon={ShieldCheck}
      >
        <div className="space-y-6">
          {groups.map((group) => {
            const grantable = group.items.filter(
              (item) => !adminOnly.includes(item.key)
            );
            const allOn =
              grantable.length > 0 &&
              grantable.every((item) => selected.has(item.key));

            return (
              <fieldset key={group.group} className="space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.group}
                  </legend>
                  {!isLocked && grantable.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleGroup(group, !allOn)}
                    >
                      {allOn ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                    </Button>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const reserved = adminOnly.includes(item.key);
                    const inputId = `perm-${item.key}`;
                    return (
                      <label
                        key={item.key}
                        htmlFor={inputId}
                        className={
                          reserved || isLocked
                            ? "flex cursor-not-allowed gap-2.5 rounded-xl p-2.5 opacity-60"
                            : "flex cursor-pointer gap-2.5 rounded-xl p-2.5 hover:bg-muted"
                        }
                      >
                        <Checkbox
                          id={inputId}
                          className="mt-0.5"
                          checked={selected.has(item.key)}
                          disabled={reserved || isLocked}
                          onCheckedChange={() => toggle(item.key)}
                        />
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            {item.label}
                            {item.sensitive && (
                              <AlertTriangle className="size-3.5 shrink-0 text-warning-strong" />
                            )}
                            {reserved && (
                              <Lock className="size-3 shrink-0 text-muted-foreground/70" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {item.description}
                            {reserved && " Chỉ quản trị viên được cấp quyền này."}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      </SectionCard>
    </form>
  );
}
