import { useMemo, useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Power,
  Search,
  Tag,
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
  useDeletePromotion,
  usePromotions,
  useTogglePromotion,
} from "@/features/admin/promotions/hooks";
import { promotionStatus } from "@/features/admin/promotions/schema";
import { PromotionFormDialog } from "./PromotionFormDialog";
import { useConfirm } from "@/hooks/useConfirm";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatVND } from "@/utils/format";

export default function PromotionsList() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debounced = useDebounce(search, 250);
  const confirm = useConfirm();

  const promosQ = usePromotions({
    ...(debounced ? { search: debounced } : {}),
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });
  const toggleMut = useTogglePromotion();
  const deleteMut = useDeletePromotion();

  const handleEdit = (p) => {
    setEditing(p);
    setDialogOpen(true);
  };
  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleDelete = async (p) => {
    const ok = await confirm({
      title: "Xoá khuyến mãi?",
      description: `Xoá "${p.name}"? Thao tác không thể hoàn tác.`,
      variant: "destructive",
      confirmText: "Xoá",
    });
    if (ok) deleteMut.mutate(p._id);
  };

  const data = useMemo(() => {
    return (promosQ.data?.promotions || []).map((p) => ({
      ...p,
      _status: promotionStatus(p),
    }));
  }, [promosQ.data]);

  const columns = [
    {
      id: "name",
      header: "Chương trình",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-danger-muted text-danger-strong">
              <Tag className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground line-clamp-1">
                {p.name}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {p.description || (
                  <span className="italic text-muted-foreground/70">Không mô tả</span>
                )}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "value",
      header: "Giảm giá",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-1.5 font-semibold text-danger-strong">
            <Percent className="size-4" />
            {p.type === "percent" ? `${p.value}%` : formatVND(p.value)}
          </div>
        );
      },
    },
    {
      id: "scope",
      header: "Áp dụng",
      cell: ({ row }) => {
        const p = row.original;
        if (p.scope === "category") {
          return (
            <span className="inline-flex items-center rounded-full bg-info-muted px-2 py-0.5 text-xs font-medium text-info-strong ring-1 ring-inset ring-info/30">
              Danh mục: {p.category || "—"}
            </span>
          );
        }
        const count = p.books?.length || 0;
        return (
          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-300">
            {count} sản phẩm
          </span>
        );
      },
    },
    {
      id: "period",
      header: "Thời gian",
      cell: ({ row }) => (
        <div className="text-xs">
          <p className="text-foreground">
            {formatDateVN(row.original.startDate)}
          </p>
          <p className="text-muted-foreground">
            → {formatDateVN(row.original.endDate)}
          </p>
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
        const p = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Khác"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(p)}>
                  <Pencil className="size-4" />
                  Chỉnh sửa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleMut.mutate(p._id)}>
                  <Power className="size-4" />
                  {p.active ? "Tạm ngừng" : "Kích hoạt"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
                  onClick={() => handleDelete(p)}
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
          placeholder="Tìm chương trình..."
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
        title="Khuyến mãi sản phẩm"
        description={`${promosQ.data?.pagination?.total ?? data.length} chương trình`}
        actions={
          <Button onClick={handleCreate}>
            <Plus className="size-4" />
            Tạo khuyến mãi
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={promosQ.isLoading}
        isError={promosQ.isError}
        onRetry={() => promosQ.refetch()}
        toolbar={toolbar}
        totalLabel="chương trình"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={promosQ.data?.pagination?.totalPages || 0}
        totalRows={promosQ.data?.pagination?.total || 0}
        getRowId={(r) => r._id}
        emptyState={
          <EmptyState
            icon={Tag}
            title="Chưa có khuyến mãi"
            description="Tạo chương trình giảm giá đầu tiên cho sản phẩm của bạn."
            action={
              <Button onClick={handleCreate}>
                <Plus className="size-4" />
                Tạo khuyến mãi
              </Button>
            }
          />
        }
      />

      <PromotionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        promotion={editing}
      />
    </div>
  );
}
