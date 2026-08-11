import { useState } from "react";
import { Gift, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RewardFormDialog from "./RewardFormDialog";
import { useAdminGifts, useDeleteGift } from "@/features/admin/loyalty/hooks";
import { useConfirm } from "@/hooks/useConfirm";
import useDebounce from "@/hooks/useDebounce";
import { voucherValueLabel } from "@/utils/loyalty";

export default function RewardsList() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debounced = useDebounce(search, 250);
  const confirm = useConfirm();

  const query = useAdminGifts({
    q: debounced,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });
  const deleteMutation = useDeleteGift();

  const handleDelete = async (gift) => {
    const alreadyIssued = gift.issuedCount > 0;
    const ok = await confirm({
      title: alreadyIssued ? "Tắt quà này?" : "Xoá quà?",
      description: alreadyIssued
        ? `"${gift.name}" đã có ${gift.issuedCount} lượt đổi nên sẽ được tắt thay vì xoá, để giữ lịch sử của khách.`
        : `Xoá "${gift.name}" khỏi danh mục. Không thể hoàn tác.`,
      variant: "destructive",
      confirmText: alreadyIssued ? "Tắt quà" : "Xoá",
    });
    if (ok) deleteMutation.mutate(gift.id);
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (gift) => {
    setEditing(gift);
    setDialogOpen(true);
  };

  const columns = [
    {
      id: "name",
      header: "Quà",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          <code className="text-xs text-muted-foreground">
            {row.original.code}
          </code>
        </div>
      ),
    },
    {
      id: "value",
      header: "Ưu đãi",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="text-sm">
            {voucherValueLabel(row.original.voucherTemplate)}
          </div>
          <Badge
            variant={
              row.original.voucherTemplate.scope === "shipping"
                ? "info"
                : "secondary"
            }
          >
            {row.original.voucherTemplate.scope === "shipping"
              ? "Phí vận chuyển"
              : "Đơn hàng"}
          </Badge>
        </div>
      ),
    },
    {
      id: "pointsCost",
      header: "Điểm",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.pointsCost.toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      id: "stock",
      header: "Đã phát / Tồn",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.issuedCount}
          {row.original.stock > 0 ? ` / ${row.original.stock}` : " / ∞"}
        </span>
      ),
    },
    {
      id: "tier",
      header: "Hạng tối thiểu",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.minTierKey || "Mọi hạng"}
        </span>
      ),
    },
    {
      id: "active",
      header: "Trạng thái",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "success" : "outline"}>
          {row.original.active ? "Đang bật" : "Đã tắt"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <PermissionGate permission="loyalty.manage">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Hành động">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row.original)}>
                <Pencil className="size-4" />
                Sửa
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(row.original)}
                className="text-danger-strong"
              >
                <Trash2 className="size-4" />
                {row.original.issuedCount > 0 ? "Tắt quà" : "Xoá"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục quà đổi điểm"
        description="Khách dùng điểm để đổi lấy voucher riêng, dùng được như mọi mã giảm giá khác."
        actions={
          <PermissionGate permission="loyalty.manage">
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Tạo quà
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        columns={columns}
        data={query.data?.gifts || []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(row) => row.id}
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={query.data?.pagination?.totalPages || 0}
        totalRows={query.data?.pagination?.total || 0}
        totalLabel="quà"
        emptyState={
          <EmptyState
            icon={Gift}
            title="Chưa có quà nào"
            description="Tạo quà để khách hàng đổi điểm lấy voucher."
          />
        }
        toolbar={
          <DataTableToolbar>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên hoặc mã quà"
                className="pl-9"
              />
            </div>
          </DataTableToolbar>
        }
      />

      <RewardFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        gift={editing}
      />
    </div>
  );
}
