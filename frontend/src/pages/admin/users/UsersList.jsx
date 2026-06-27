import { useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { DataTableColumnHeader } from "@/components/admin/common/DataTableColumnHeader";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDeleteUser,
  useSetUserStatus,
  useUpdateUserRole,
  useUsers,
} from "@/features/admin/users/hooks";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/context/AuthContext.jsx";
import { useRoles } from "@/features/admin/roles/hooks";
import { can } from "@/lib/rbac";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatVND } from "@/utils/format";

// The DB stores the customer role as 'user' while the API reports 'customer';
// every other role uses the same key on both sides.
const CUSTOMER_ROLE_KEY = "user";
const toOptionValue = (key) => (key === CUSTOMER_ROLE_KEY ? "customer" : key);

export default function UsersList() {
  const { user: me } = useAuth();
  const canAssignRole = can(me, "user.role.assign") && can(me, "role.read");
  const confirm = useConfirm();

  // Roles are defined at runtime, so the picker is driven by the API rather
  // than a fixed list. Only admins may read it, which is also who may assign.
  const rolesQ = useRoles({ enabled: canAssignRole });
  const roleOptions = useMemo(
    () =>
      (rolesQ.data || []).map((r) => ({ value: toOptionValue(r.key), label: r.label })),
    [rolesQ.data]
  );
  const roleLabelOf = (value) =>
    roleOptions.find((option) => option.value === value)?.label || value;

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debounced = useDebounce(search, 250);

  const params = useMemo(() => {
    const p = {
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
    };
    if (debounced) p.search = debounced;
    if (role !== "all") p.role = role;
    if (status !== "all") p.status = status;
    return p;
  }, [debounced, role, status, pagination]);

  const usersQ = useUsers(params);
  const updateRole = useUpdateUserRole();
  const setUserStatus = useSetUserStatus();
  const deleteUser = useDeleteUser();

  const handleToggleBan = async (u) => {
    const willBan = u.status !== "banned";
    const ok = await confirm({
      title: willBan ? "Cấm người dùng?" : "Bỏ cấm?",
      description: willBan
        ? `Người dùng "${u.name}" sẽ không thể đăng nhập.`
        : `Khôi phục quyền truy cập cho "${u.name}".`,
      confirmText: willBan ? "Cấm" : "Khôi phục",
      variant: willBan ? "destructive" : "default",
    });
    if (ok) {
      setUserStatus.mutate({
        id: u._id,
        status: willBan ? "banned" : "active",
      });
    }
  };

  const handleChangeRole = async (u, nextRole) => {
    if (nextRole === u.role) return;
    const ok = await confirm({
      title: "Đổi vai trò?",
      description: `"${u.name}" sẽ chuyển sang vai trò ${roleLabelOf(nextRole)}. Tài khoản này sẽ bị đăng xuất khỏi mọi thiết bị và cần đăng nhập lại.`,
      confirmText: "Đổi vai trò",
    });
    if (ok) updateRole.mutate({ id: u._id, role: nextRole });
  };

  const handleDelete = async (u) => {
    const ok = await confirm({
      title: "Xoá người dùng?",
      description: `Xoá vĩnh viễn tài khoản "${u.name}".`,
      confirmText: "Xoá",
      variant: "destructive",
    });
    if (ok) deleteUser.mutate(u._id);
  };

  const columns = [
    {
      id: "user",
      header: "Người dùng",
      cell: ({ row }) => {
        const u = row.original;
        const initial = (u.name || "?").charAt(0).toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="text-xs">{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{u.name}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "phone",
      header: "Số điện thoại",
      accessorKey: "phone",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.phone || "Chưa cập nhật"}
        </span>
      ),
    },
    {
      id: "role",
      header: "Vai trò",
      accessorKey: "role",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.role}
          label={row.original.roleLabel || roleLabelOf(row.original.role)}
        />
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      accessorKey: "status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "orders",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Đơn" />,
      accessorKey: "ordersCount",
      cell: ({ row }) => (
        <span className="tabular-nums font-semibold text-foreground">
          {row.original.ordersCount || 0}
        </span>
      ),
    },
    {
      id: "spend",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Chi tiêu" />,
      accessorKey: "totalSpend",
      cell: ({ row }) => (
        <span className="font-semibold text-primary">
          {formatVND(row.original.totalSpend || 0)}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: "Tạo lúc",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDateVN(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const u = row.original;
        const isSelf = u._id === me?._id || u.email === me?.email;
        return (
          <div className="flex justify-end">
            <PermissionGate permission="user.manage">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Khác" disabled={isSelf}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canAssignRole && (
                    <>
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <ShieldCheck className="size-4" />
                        Đổi vai trò
                      </DropdownMenuLabel>
                      {roleOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          disabled={option.value === u.role}
                          onClick={() => handleChangeRole(u, option.value)}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => handleToggleBan(u)}>
                    {u.status === "banned" ? (
                      <>
                        <CheckCircle2 className="size-4" />
                        Bỏ cấm
                      </>
                    ) : (
                      <>
                        <Ban className="size-4" />
                        Cấm tài khoản
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
                    onClick={() => handleDelete(u)}
                  >
                    <Trash2 className="size-4" />
                    Xoá
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PermissionGate>
          </div>
        );
      },
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder="Tìm tên, email, SĐT..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
            className="h-9 pl-8"
          />
        </div>
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả vai trò</SelectItem>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="active">Hoạt động</SelectItem>
            <SelectItem value="banned">Đã cấm</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Người dùng"
        description={`${usersQ.data?.pagination?.total || 0} tài khoản`}
      />

      <DataTable
        columns={columns}
        data={usersQ.data?.users || []}
        isLoading={usersQ.isLoading}
        isError={usersQ.isError}
        onRetry={() => usersQ.refetch()}
        toolbar={toolbar}
        totalLabel="người dùng"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={usersQ.data?.pagination?.totalPages || 1}
        totalRows={usersQ.data?.pagination?.total || 0}
        getRowId={(r) => r._id}
        emptyState={
          <EmptyState
            icon={Users}
            title="Không có người dùng"
            description="Không có người dùng nào khớp với bộ lọc."
          />
        }
      />
    </div>
  );
}
