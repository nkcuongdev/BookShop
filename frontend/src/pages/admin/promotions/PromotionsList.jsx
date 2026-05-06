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
  const debounced = useDebounce(search, 250);
  const confirm = useConfirm();

  const promosQ = usePromotions(debounced ? { search: debounced } : {});
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
    return (promosQ.data || []).map((p) => ({
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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <Tag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-secondary-900 line-clamp-1">
                {p.name}
              </p>
              <p className="text-xs text-secondary-500 line-clamp-1">
                {p.description || (
                  <span className="italic text-secondary-400">Không mô tả</span>
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
          <div className="flex items-center gap-1.5 font-semibold text-rose-600">
            <Percent className="h-3.5 w-3.5" />
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
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
              Danh mục: {p.category || "—"}
            </span>
          );
        }
        const count = p.books?.length || 0;
        return (
          <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
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
          <p className="text-secondary-700">
            {formatDateVN(row.original.startDate)}
          </p>
          <p className="text-secondary-500">
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
                  className="h-8 w-8"
                  aria-label="Khác"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Chỉnh sửa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleMut.mutate(p._id)}>
                  <Power className="h-3.5 w-3.5" />
                  {p.active ? "Tạm ngừng" : "Kích hoạt"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                  onClick={() => handleDelete(p)}
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
          placeholder="Tìm chương trình..."
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
        title="Khuyến mãi sản phẩm"
        description={`${data.length} chương trình`}
        actions={
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" />
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
        getRowId={(r) => r._id}
        emptyState={
          <EmptyState
            icon={Tag}
            title="Chưa có khuyến mãi"
            description="Tạo chương trình giảm giá đầu tiên cho sản phẩm của bạn."
            action={
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4" />
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
