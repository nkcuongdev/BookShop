import { useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
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
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatVND } from "@/utils/format";

export default function UsersList() {
  const { user: me } = useAuth();
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const debounced = useDebounce(search, 250);

  const params = useMemo(() => {
    const p = {};
    if (debounced) p.search = debounced;
    if (role !== "all") p.role = role;
    if (status !== "all") p.status = status;
    return p;
  }, [debounced, role, status]);

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
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs">{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-secondary-800">{u.name}</p>
              <p className="truncate text-xs text-secondary-500">{u.email}</p>
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
        <span className="text-sm text-secondary-700">
          {row.original.phone || "Chưa cập nhật"}
        </span>
      ),
    },
    {
      id: "role",
      header: "Vai trò",
      accessorKey: "role",
      cell: ({ row }) => <StatusBadge status={row.original.role} />,
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
        <span className="tabular-nums font-semibold text-secondary-700">
          {row.original.ordersCount || 0}
        </span>
      ),
    },
    {
      id: "spend",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Chi tiêu" />,
      accessorKey: "totalSpend",
      cell: ({ row }) => (
        <span className="font-semibold text-primary-600">
          {formatVND(row.original.totalSpend || 0)}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: "Tạo lúc",
      cell: ({ row }) => (
        <span className="text-xs text-secondary-500">
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
            <PermissionGate action="user.ban">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Khác" disabled={isSelf}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      updateRole.mutate({
                        id: u._id,
                        role: u.role === "admin" ? "customer" : "admin",
                      })
                    }
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {u.role === "admin" ? "Hạ xuống khách hàng" : "Nâng lên admin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleBan(u)}>
                    {u.status === "banned" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Bỏ cấm
                      </>
                    ) : (
                      <>
                        <Ban className="h-3.5 w-3.5" />
                        Cấm tài khoản
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                    onClick={() => handleDelete(u)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400" />
          <Input
            placeholder="Tìm tên, email, SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả vai trò</SelectItem>
            <SelectItem value="admin">Quản trị</SelectItem>
            <SelectItem value="customer">Khách hàng</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
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
        description={`${usersQ.data?.length || 0} tài khoản`}
      />

      <DataTable
        columns={columns}
        data={usersQ.data || []}
        isLoading={usersQ.isLoading}
        isError={usersQ.isError}
        onRetry={() => usersQ.refetch()}
        toolbar={toolbar}
        totalLabel="người dùng"
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
