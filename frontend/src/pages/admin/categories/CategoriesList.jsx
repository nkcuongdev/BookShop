import { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FolderTree,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { FormField } from "@/components/admin/common/FormField";
import { ImageUploader } from "@/components/admin/common/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/features/admin/categories/hooks";
import { categorySchema, generateSlug } from "@/features/admin/categories/schema";
import { useConfirm } from "@/hooks/useConfirm";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN } from "@/utils/format";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

export default function CategoriesList() {
  const { user } = useAuth();
  const canUpload = can(user, "upload.admin");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const debounced = useDebounce(search, 200);
  const confirm = useConfirm();

  const categoriesQ = useCategories();
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();

  const methods = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", slug: "", description: "", image: "" },
  });

  const filtered = useMemo(() => {
    const list = categoriesQ.data || [];
    if (!debounced) return list;
    const q = debounced.toLowerCase();
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    );
  }, [categoriesQ.data, debounced]);

  const openCreate = () => {
    setEditing(null);
    methods.reset({ name: "", slug: "", description: "", image: "" });
    setDialogOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    methods.reset({
      name: c.name || "",
      slug: c.slug || "",
      description: c.description || "",
      image: c.image || "",
    });
    setDialogOpen(true);
  };

  const onSubmit = methods.handleSubmit(async (values) => {
    if (editing) {
      await updateMut.mutateAsync({ id: editing._id || editing.id, data: values });
    } else {
      await createMut.mutateAsync(values);
    }
    setDialogOpen(false);
  });

  const handleDelete = async (c) => {
    const ok = await confirm({
      title: "Xoá danh mục?",
      description: `Bạn có chắc muốn xoá "${c.name}"?`,
      variant: "destructive",
      confirmText: "Xoá",
    });
    if (ok) deleteMut.mutate(c._id || c.id);
  };

  const columns = [
    {
      id: "name",
      header: "Tên danh mục",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.image ? (
            <img
              src={row.original.image}
              alt={row.original.name}
              className="size-10 shrink-0 rounded-lg object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
              <FolderTree className="size-4" />
            </div>
          )}
          <span className="font-medium text-foreground">{row.original.name}</span>
        </div>
      ),
    },
    {
      id: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <code className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">
          {row.original.slug}
        </code>
      ),
    },
    {
      id: "description",
      header: "Mô tả",
      cell: ({ row }) => (
        <p className="line-clamp-1 text-muted-foreground max-w-md">
          {row.original.description || "—"}
        </p>
      ),
    },
    {
      id: "createdAt",
      header: "Ngày tạo",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDateVN(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => openEdit(row.original)}
            aria-label="Sửa"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-danger-strong hover:text-danger-strong hover:bg-danger-muted"
            onClick={() => handleDelete(row.original)}
            aria-label="Xoá"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          placeholder="Tìm tên hoặc slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8"
        />
      </div>
      <Button variant="outline" size="sm" onClick={() => categoriesQ.refetch()}>
        <RotateCw className="size-4" />
        Tải lại
      </Button>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục"
        description={`${categoriesQ.data?.length || 0} danh mục`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Thêm danh mục
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={categoriesQ.isLoading}
        toolbar={toolbar}
        totalLabel="danh mục"
        getRowId={(r) => r._id || r.id}
        emptyState={
          <EmptyState
            icon={FolderTree}
            title="Chưa có danh mục"
            description="Hãy thêm danh mục đầu tiên."
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" />
                Thêm danh mục
              </Button>
            }
          />
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
            </DialogTitle>
          </DialogHeader>
          <FormProvider {...methods}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField name="name" label="Tên danh mục" required>
                {(field) => (
                  <Input
                    placeholder="Ví dụ: Văn học"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!editing) {
                        methods.setValue("slug", generateSlug(e.target.value), {
                          shouldValidate: true,
                        });
                      }
                    }}
                  />
                )}
              </FormField>
              <FormField name="slug" label="Slug" required description="Dùng trong URL">
                {(field) => <Input placeholder="van-hoc" {...field} />}
              </FormField>
              <FormField name="image" label="Ảnh danh mục">
                {(field) => (
                  <ImageUploader
                    value={field.value}
                    onChange={field.onChange}
                    purpose="category"
                    ratio="16/9"
                    disabled={!canUpload}
                  />
                )}
              </FormField>
              <FormField name="description" label="Mô tả">
                {(field) => <Textarea rows={3} placeholder="Mô tả ngắn..." {...field} />}
              </FormField>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Huỷ
                </Button>
                <Button
                  type="submit"
                  loading={createMut.isPending || updateMut.isPending}
                >
                  {editing ? "Cập nhật" : "Thêm mới"}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
    </div>
  );
}
