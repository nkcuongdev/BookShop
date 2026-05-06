import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText,
  Eye,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  MoreHorizontal,
  Globe,
  EyeOff,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { DataTableColumnHeader } from "@/components/admin/common/DataTableColumnHeader";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  usePosts,
  useDeletePost,
  usePublishPost,
  useUnpublishPost,
  usePostCategories,
} from "@/features/admin/posts/hooks";
import { POST_STATUS_OPTIONS, getPostStatusConfig } from "@/features/admin/posts/schema";
import { useConfirm } from "@/hooks/useConfirm";
import useDebounce from "@/hooks/useDebounce";
import { formatRelativeDate } from "@/utils/format";

export default function PostsList() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const debouncedSearch = useDebounce(search, 250);

  const postsQ = usePosts({
    status: status !== "all" ? status : undefined,
    search: debouncedSearch || undefined,
  });
  const categoriesQ = usePostCategories();
  const deletePost = useDeletePost();
  const publishPost = usePublishPost();
  const unpublishPost = useUnpublishPost();

  const categories = categoriesQ.data || [];
  const categoryById = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => {
      map.set(c._id, c);
      map.set(c.id, c);
    });
    return map;
  }, [categories]);

  const posts = postsQ.data?.posts || [];
  const filtered = useMemo(() => {
    let list = posts;
    if (categoryFilter !== "all") {
      list = list.filter((p) => {
        const catId = p.category?._id || p.category;
        return catId === categoryFilter;
      });
    }
    return list;
  }, [posts, categoryFilter]);

  const handleDelete = async (post) => {
    const ok = await confirm({
      title: "Xóa bài viết?",
      description: `Bạn có chắc muốn xóa "${post.title}"? Hành động này không thể hoàn tác.`,
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (!ok) return;
    deletePost.mutate(post._id || post.id);
  };

  const handlePublish = async (post) => {
    const id = post._id || post.id;
    publishPost.mutate(id);
  };

  const handleUnpublish = async (post) => {
    const id = post._id || post.id;
    unpublishPost.mutate(id);
  };

  const columns = [
    {
      id: "post",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bài viết" />,
      accessorKey: "title",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-3">
            {p.thumbnail ? (
              <img
                src={p.thumbnail}
                alt={p.title}
                className="h-14 w-20 shrink-0 rounded bg-gray-100 object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded bg-gray-100">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-secondary-800 line-clamp-1">{p.title}</p>
              <p className="text-xs text-secondary-500 line-clamp-1">
                {p.shortDescription || "Không có mô tả"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "category",
      header: "Danh mục",
      accessorKey: "category",
      cell: ({ row }) => {
        const cat = row.original.category;
        const catObj = typeof cat === "object" ? cat : categoryById.get(cat);
        return catObj?.name ? (
          <Badge variant="outline">{catObj.name}</Badge>
        ) : (
          <span className="text-secondary-400">—</span>
        );
      },
    },
    {
      id: "author",
      header: "Tác giả",
      accessorKey: "author",
      cell: ({ row }) => {
        const author = row.original.author;
        return (
          <span className="text-secondary-700">{author?.name || "—"}</span>
        );
      },
    },
    {
      id: "status",
      header: "Trạng thái",
      accessorKey: "status",
      cell: ({ row }) => {
        const statusConfig = getPostStatusConfig(row.original.status);
        return <StatusBadge status={statusConfig.variant}>{statusConfig.label}</StatusBadge>;
      },
    },
    {
      id: "views",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lượt xem" />,
      accessorKey: "viewCount",
      cell: ({ row }) => (
        <span className="tabular-nums text-secondary-700">{row.original.viewCount || 0}</span>
      ),
    },
    {
      id: "date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày tạo" />,
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <span className="text-sm text-secondary-600">
          {formatRelativeDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        const id = p._id || p.id;
        const isPublished = p.status === "published";
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(`/admin/posts/${id}/edit`)}
              aria-label="Sửa"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Khác">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/admin/posts/${id}/edit`)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Chỉnh sửa
                </DropdownMenuItem>
                {p.status === "published" && (
                  <DropdownMenuItem asChild>
                    <a href={`/news/${p.slug}`} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-3.5 w-3.5" />
                      Xem trang
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {isPublished ? (
                  <DropdownMenuItem onClick={() => handleUnpublish(p)}>
                    <EyeOff className="h-3.5 w-3.5" />
                    Hủy xuất bản
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => handlePublish(p)}>
                    <Globe className="h-3.5 w-3.5" />
                    Xuất bản
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                  onClick={() => handleDelete(p)}
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
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400" />
          <Input
            placeholder="Tìm theo tiêu đề..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {POST_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Danh mục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c._id || c.id} value={c._id || c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => postsQ.refetch()}>
          <RotateCw className="h-3.5 w-3.5" />
          Tải lại
        </Button>
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý bài viết"
        description={`${filtered.length} bài viết`}
        actions={
          <Button asChild>
            <Link to="/admin/posts/new">
              <Plus className="h-4 w-4" />
              Thêm bài viết
            </Link>
          </Button>
        }
      />

      {postsQ.isError ? (
        <ErrorState onRetry={() => postsQ.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={postsQ.isLoading}
          toolbar={toolbar}
          totalLabel="bài viết"
          getRowId={(r) => r._id || r.id}
          emptyState={
            <EmptyState
              icon={FileText}
              title="Chưa có bài viết nào"
              description="Hãy tạo bài viết đầu tiên cho blog."
              action={
                <Button asChild>
                  <Link to="/admin/posts/new">
                    <Plus className="h-4 w-4" />
                    Thêm bài viết
                  </Link>
                </Button>
              }
            />
          }
        />
      )}
    </div>
  );
}
