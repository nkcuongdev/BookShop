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
import { Badge } from "@/components/ui/badge";
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
import Progress from "@/components/ui/progress";

export default function VouchersList() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debounced = useDebounce(search, 250);
  const confirm = useConfirm();

  const vouchersQ = useVouchers({
    ...(debounced ? { search: debounced } : {}),
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });
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
    return (vouchersQ.data?.vouchers || []).map((v) => ({
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
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <Ticket className="size-4" />
          </div>
          <div>
            <code className="font-mono text-sm font-bold text-foreground">
              {row.original.code}
            </code>
            <p className="text-xs text-muted-foreground line-clamp-1">
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
            <p className="font-semibold text-primary">
              {v.type === "percent" ? `${v.value}%` : formatVND(v.value)}
            </p>
            <p className="text-xs text-muted-foreground">
              {v.minOrder > 0
                ? `Đơn từ ${formatVND(v.minOrder)}`
                : "Không giới hạn"}
            </p>
          </div>
        );
      },
    },
    {
      id: "scope",
      header: "Phân loại",
      cell: ({ row }) => (
        <Badge variant={row.original.scope === "shipping" ? "info" : "outline"}>
          {row.original.scope === "shipping" ? "Phí vận chuyển" : "Đơn hàng"}
        </Badge>
      ),
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
              <span className="font-semibold text-foreground tabular-nums">
                {v.usedCount}/{v.usageLimit}
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} size="sm" className="mt-1" label={`Đã dùng ${pct}%`} />
          </div>
        );
      },
    },
    {
      id: "period",
      header: "Thời gian",
      cell: ({ row }) => (
        <div className="text-xs">
          <p className="text-foreground">{formatDateVN(row.original.startAt)}</p>
          <p className="text-muted-foreground">→ {formatDateVN(row.original.endAt)}</p>
        </div>
      ),
    },
    {
      id: "visibility",
      header: "Hiển thị",
      cell: ({ row }) => (
        <Badge variant={row.original.publicVisible ? "info" : "outline"}>
          {row.original.publicVisible ? "Công khai" : "Mã riêng"}
        </Badge>
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
                <Button variant="ghost" size="icon" className="size-8" aria-label="Khác">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(v)}>
                  <Pencil className="size-4" />
                  Chỉnh sửa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleMut.mutate(v._id)}>
                  <Power className="size-4" />
                  {v.active ? "Tạm ngừng" : "Kích hoạt"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
                  onClick={() => handleDelete(v)}
                >
                  <Trash2 className="size-4" />
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
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          placeholder="Tìm mã, mô tả..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
          className="h-9 pl-8"
        />
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voucher & khuyến mãi"
        description={`${vouchersQ.data?.pagination?.total ?? data.length} voucher`}
        actions={
          <Button onClick={handleCreate}>
            <Plus className="size-4" />
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
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={vouchersQ.data?.pagination?.totalPages || 0}
        totalRows={vouchersQ.data?.pagination?.total || 0}
        getRowId={(r) => r._id}
        emptyState={
          <EmptyState
            icon={Ticket}
            title="Chưa có voucher"
            description="Tạo voucher đầu tiên để khuyến mãi cho khách hàng."
            action={
              <Button onClick={handleCreate}>
                <Plus className="size-4" />
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
