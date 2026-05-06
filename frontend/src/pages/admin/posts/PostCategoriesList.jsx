import { useState } from "react";
import {
  FolderOpen,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  usePostCategories,
  useCreatePostCategory,
  useUpdatePostCategory,
  useDeletePostCategory,
} from "@/features/admin/posts/hooks";
import { useConfirm } from "@/hooks/useConfirm";

const EMPTY_CATEGORY = {
  name: "",
  description: "",
  isActive: true,
  order: 0,
};

export default function PostCategoriesList() {
  const confirm = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState(EMPTY_CATEGORY);

  const categoriesQ = usePostCategories();
  const createCategory = useCreatePostCategory();
  const updateCategory = useUpdatePostCategory();
  const deleteCategory = useDeletePostCategory();

  const categories = categoriesQ.data || [];

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setForm(EMPTY_CATEGORY);
    setDialogOpen(true);
  };

  const handleOpenEdit = (category) => {
    setEditingCategory(category);
    setForm({
      name: category.name || "",
      description: category.description || "",
      isActive: category.isActive !== false,
      order: category.order || 0,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingCategory) {
      await updateCategory.mutateAsync({
        id: editingCategory._id || editingCategory.id,
        data: form,
      });
    } else {
      await createCategory.mutateAsync(form);
    }
    setDialogOpen(false);
  };

  const handleDelete = async (category) => {
    const ok = await confirm({
      title: "Xóa danh mục?",
      description: `Bạn có chắc muốn xóa danh mục "${category.name}"? Danh mục chỉ có thể xóa nếu không có bài viết nào đang sử dụng.`,
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (!ok) return;
    deleteCategory.mutate(category._id || category.id);
  };

  const columns = [
    {
      id: "name",
      header: "Tên danh mục",
      accessorKey: "name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-secondary-800">{row.original.name}</p>
          <p className="text-xs text-secondary-500">{row.original.slug}</p>
        </div>
      ),
    },
    {
      id: "description",
      header: "Mô tả",
      accessorKey: "description",
      cell: ({ row }) => (
        <span className="text-secondary-600 line-clamp-2">
          {row.original.description || "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      accessorKey: "isActive",
      cell: ({ row }) => (
        <StatusBadge status={row.original.isActive !== false ? "success" : "secondary"}>
          {row.original.isActive !== false ? "Hoạt động" : "Ẩn"}
        </StatusBadge>
      ),
    },
    {
      id: "order",
      header: "Thứ tự",
      accessorKey: "order",
      cell: ({ row }) => (
        <span className="tabular-nums text-secondary-700">{row.original.order || 0}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleOpenEdit(c)}
              aria-label="Sửa"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenEdit(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Chỉnh sửa
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                  onClick={() => handleDelete(c)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa
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
      <div className="flex flex-1" />
      <Button variant="outline" size="sm" onClick={() => categoriesQ.refetch()}>
        <RotateCw className="h-3.5 w-3.5" />
        Tải lại
      </Button>
    </DataTableToolbar>
  );

  const isSaving = createCategory.isPending || updateCategory.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục bài viết"
        description={`${categories.length} danh mục`}
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Thêm danh mục
          </Button>
        }
      />

      {categoriesQ.isError ? (
        <ErrorState onRetry={() => categoriesQ.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={categories}
          isLoading={categoriesQ.isLoading}
          toolbar={toolbar}
          totalLabel="danh mục"
          getRowId={(r) => r._id || r.id}
          emptyState={
            <EmptyState
              icon={FolderOpen}
              title="Chưa có danh mục nào"
              description="Tạo danh mục để phân loại bài viết."
              action={
                <Button onClick={handleOpenCreate}>
                  <Plus className="h-4 w-4" />
                  Thêm danh mục
                </Button>
              }
            />
          }
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">
                Tên danh mục <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tin công nghệ"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-desc">Mô tả</Label>
              <Textarea
                id="cat-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Mô tả ngắn về danh mục"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cat-order">Thứ tự hiển thị</Label>
                <Input
                  id="cat-order"
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
                  min={0}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="cat-active"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="cat-active" className="cursor-pointer">
                  Hoạt động
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Đang lưu..." : editingCategory ? "Cập nhật" : "Tạo mới"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
