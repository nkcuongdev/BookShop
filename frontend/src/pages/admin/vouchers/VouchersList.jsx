import { useMemo, useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  Ticket,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDeleteVoucher,
  useToggleVoucher,
  useVouchers,
} from "@/features/admin/vouchers/hooks";
import { voucherStatus } from "@/features/admin/vouchers/schema";
import { VoucherFormDialog } from "./VoucherFormDialog";
import { useConfirm } from "@/hooks/useConfirm";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatVND } from "@/utils/format";

export default function VouchersList() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const debounced = useDebounce(search, 250);
  const confirm = useConfirm();

  const vouchersQ = useVouchers(
    debounced ? { search: debounced } : {}
  );
  const toggleMut = useToggleVoucher();
  const deleteMut = useDeleteVoucher();

  const handleEdit = (v) => {
    setEditing(v);
    setDialogOpen(true);
  };
  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleDelete = async (v) => {
    const ok = await confirm({
      title: "Xoá voucher?",
      description: `Xoá mã "${v.code}"?`,
      variant: "destructive",
      confirmText: "Xoá",
    });
    if (ok) deleteMut.mutate(v._id);
  };

  const data = useMemo(() => {
    return (vouchersQ.data || []).map((v) => ({
      ...v,
      _status: voucherStatus(v),
    }));
  }, [vouchersQ.data]);

  const columns = [
    {
      id: "code",
      header: "Mã",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <Ticket className="h-4 w-4" />
          </div>
          <div>
            <code className="font-mono text-sm font-bold text-secondary-900">
              {row.original.code}
            </code>
            <p className="text-xs text-secondary-500 line-clamp-1">
              {row.original.description || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "value",
      header: "Giá trị",
      cell: ({ row }) => {
        const v = row.original;
        return (
          <div>
            <p className="font-semibold text-primary-600">
              {v.type === "percent" ? `${v.value}%` : formatVND(v.value)}
            </p>
            <p className="text-xs text-secondary-500">
              {v.minOrder > 0
                ? `Đơn từ ${formatVND(v.minOrder)}`
                : "Không giới hạn"}
            </p>
          </div>
        );
      },
    },
    {
      id: "usage",
      header: "Lượt dùng",
      cell: ({ row }) => {
        const v = row.original;
        const pct = Math.min(100, Math.round((v.usedCount / v.usageLimit) * 100));
        return (
          <div className="min-w-[120px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-secondary-800 tabular-nums">
                {v.usedCount}/{v.usageLimit}
              </span>
              <span className="text-secondary-500">{pct}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      id: "period",
      header: "Thời gian",
      cell: ({ row }) => (
        <div className="text-xs">
          <p className="text-secondary-700">{formatDateVN(row.original.startAt)}</p>
          <p className="text-secondary-500">→ {formatDateVN(row.original.endAt)}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: ({ row }) => <StatusBadge status={row.original._status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const v = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Khác">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(v)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Chỉnh sửa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleMut.mutate(v._id)}>
                  <Power className="h-3.5 w-3.5" />
                  {v.active ? "Tạm ngừng" : "Kích hoạt"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                  onClick={() => handleDelete(v)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xoá
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400" />
        <Input
          placeholder="Tìm mã, mô tả..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8"
        />
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voucher & khuyến mãi"
        description={`${data.length} voucher`}
        actions={
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Tạo voucher
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={vouchersQ.isLoading}
        isError={vouchersQ.isError}
        onRetry={() => vouchersQ.refetch()}
        toolbar={toolbar}
        totalLabel="voucher"
        getRowId={(r) => r._id}
        emptyState={
          <EmptyState
            icon={Ticket}
            title="Chưa có voucher"
            description="Tạo voucher đầu tiên để khuyến mãi cho khách hàng."
            action={
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4" />
                Tạo voucher
              </Button>
            }
          />
        }
      />

      <VoucherFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        voucher={editing}
      />
    </div>
  );
}
