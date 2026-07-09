import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Download,
  Eye,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { DataTableColumnHeader } from "@/components/admin/common/DataTableColumnHeader";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBooks, useDeleteBook } from "@/features/admin/books/hooks";
import { BookPreviewSheet } from "./BookPreviewSheet";
import { useCategories } from "@/features/admin/categories/hooks";
import { useConfirm } from "@/hooks/useConfirm";
import useDebounce from "@/hooks/useDebounce";
import { formatVND } from "@/utils/format";

function stockStatus(n) {
  if (n <= 0) return "out_of_stock";
  if (n < 10) return "low_stock";
  return "in_stock";
}

export function toCSV(rows) {
  const headers = ["title", "author", "category", "price", "stock", "sold"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
  }
  // Excel on Windows needs the UTF-8 BOM to reliably detect Vietnamese text.
  return `\uFEFF${lines.join("\r\n")}`;
}

function downloadCSV(name, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BooksList() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [previewBook, setPreviewBook] = useState(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debouncedSearch = useDebounce(search, 250);

  const bookParams = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      search: debouncedSearch || undefined,
      category: category === "all" ? undefined : category,
      stockStatus: stockFilter === "all" ? undefined : stockFilter,
    }),
    [pagination, debouncedSearch, category, stockFilter]
  );
  const booksQ = useBooks(bookParams);
  const categoriesQ = useCategories();
  const deleteBook = useDeleteBook();

  const categories = useMemo(() => categoriesQ.data || [], [categoriesQ.data]);
  const categoryByKey = useMemo(() => {
    const m = new Map();
    categories.forEach((c) => {
      m.set(c.slug, c);
      m.set(c._id, c);
    });
    return m;
  }, [categories]);

  const filtered = booksQ.data?.books || [];

  const handleDelete = async (book) => {
    const ok = await confirm({
      title: "Xoá sách?",
      description: `Bạn có chắc muốn xoá "${book.title}"? Hành động này không thể hoàn tác.`,
      confirmText: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    deleteBook.mutate(book._id || book.id);
  };

  const columns = [
    {
      id: "book",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sách" />,
      accessorKey: "title",
      cell: ({ row }) => {
        const b = row.original;
        return (
          <button
            type="button"
            onClick={() => setPreviewBook(b)}
            className="group flex items-center gap-3 text-left"
            title="Xem nhanh"
          >
            <img
              src={b.imageUrl}
              alt={b.title}
              className="h-14 w-10 shrink-0 rounded-lg bg-muted object-cover"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />
            <div className="min-w-0">
              <p className="font-medium text-foreground line-clamp-1 group-hover:text-primary">
                {b.title}
              </p>
              <p className="text-xs text-muted-foreground">{b.author}</p>
            </div>
          </button>
        );
      },
    },
    {
      id: "category",
      header: "Danh mục",
      accessorKey: "category",
      cell: ({ row }) => {
        const cat = row.original.category;
        const found = categoryByKey.get(cat);
        return (
          <span className="inline-flex items-center rounded-full bg-info-muted px-2.5 py-0.5 text-xs font-medium text-info-strong">
            {found?.name || cat || "—"}
          </span>
        );
      },
    },
    {
      id: "price",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Giá" />,
      accessorKey: "price",
      cell: ({ row }) => (
        <span className="font-semibold text-foreground">
          {formatVND(row.original.price)}
        </span>
      ),
    },
    {
      id: "stock",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kho" />,
      accessorKey: "stock",
      cell: ({ row }) => {
        const s = row.original.stock || 0;
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground tabular-nums">{s}</span>
            <StatusBadge status={stockStatus(s)} />
          </div>
        );
      },
    },
    {
      id: "sold",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Đã bán" />,
      accessorKey: "sold",
      cell: ({ row }) => (
        <span className="tabular-nums text-foreground">{row.original.sold || 0}</span>
      ),
    },
    {
      id: "rating",
      header: "Đánh giá",
      accessorKey: "rating",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 text-xs">
          <span className="text-warning-strong">★</span>
          <span className="font-semibold">{row.original.rating || 0}</span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const b = row.original;
        const id = b._id || b.id;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setPreviewBook(b)}
              aria-label="Xem nhanh"
            >
              <Eye className="size-4" />
            </Button>
            <PermissionGate permission="book.write">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => navigate(`/admin/books/${id}/edit`)}
                aria-label="Sửa"
              >
                <Pencil className="size-4" />
              </Button>
            </PermissionGate>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Khác">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPreviewBook(b)}>
                  <Eye className="size-4" />
                  Xem nhanh
                </DropdownMenuItem>
                <PermissionGate permission="book.write">
                  <DropdownMenuItem onClick={() => navigate(`/admin/books/${id}/edit`)}>
                    <Pencil className="size-4" />
                    Chỉnh sửa
                  </DropdownMenuItem>
                </PermissionGate>
                <PermissionGate permission="book.delete">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
                    onClick={() => handleDelete(b)}
                  >
                    <Trash2 className="size-4" />
                    Xoá
                  </DropdownMenuItem>
                </PermissionGate>
              </DropdownMenuContent>
            </DropdownMenu>
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
            placeholder="Tìm theo tên, tác giả..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
            className="h-9 pl-8"
          />
        </div>
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Danh mục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c._id} value={c.slug}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={stockFilter}
          onValueChange={(value) => {
            setStockFilter(value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Tồn kho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả tồn kho</SelectItem>
            <SelectItem value="in_stock">Còn hàng</SelectItem>
            <SelectItem value="low_stock">Sắp hết</SelectItem>
            <SelectItem value="out_of_stock">Hết hàng</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCSV("books.csv", toCSV(filtered))}
        >
          <Download className="size-4" />
          Xuất CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => booksQ.refetch()}>
          <RotateCw className="size-4" />
          Tải lại
        </Button>
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý sách"
        description={`${booksQ.data?.pagination?.total || 0} sản phẩm`}
        actions={
          <PermissionGate permission="book.write">
            <Button asChild>
              <Link to="/admin/books/new">
                <Plus className="size-4" />
                Thêm sách
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      {booksQ.isError ? (
        <ErrorState onRetry={() => booksQ.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={booksQ.isLoading}
          toolbar={toolbar}
          totalLabel="sách"
          pagination={pagination}
          onPaginationChange={setPagination}
          pageCount={booksQ.data?.pagination?.totalPages || 1}
          totalRows={booksQ.data?.pagination?.total || 0}
          getRowId={(r) => r._id || r.id}
          emptyState={
            <EmptyState
              icon={BookOpen}
              title="Chưa có sách nào"
              description="Hãy thêm sách đầu tiên vào cửa hàng."
              action={
                <Button asChild>
                  <Link to="/admin/books/new">
                    <Plus className="size-4" />
                    Thêm sách
                  </Link>
                </Button>
              }
            />
          }
        />
      )}

      <BookPreviewSheet
        open={!!previewBook}
        onOpenChange={(v) => !v && setPreviewBook(null)}
        bookId={previewBook?._id || previewBook?.id}
        fallbackBook={previewBook}
        categoryByKey={categoryByKey}
      />
    </div>
  );
}
