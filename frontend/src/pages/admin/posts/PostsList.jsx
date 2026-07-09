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
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

export default function PostsList() {
  const { user } = useAuth();
  const canWrite = can(user, "post.write");
  const canPublish = can(user, "post.publish");
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

  const categories = useMemo(() => categoriesQ.data || [], [categoriesQ.data]);
  const categoryById = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => {
      map.set(c._id, c);
      map.set(c.id, c);
    });
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    let list = postsQ.data?.posts || [];
    if (categoryFilter !== "all") {
      list = list.filter((p) => {
        const catId = p.category?._id || p.category;
        return catId === categoryFilter;
      });
    }
    return list;
  }, [postsQ.data?.posts, categoryFilter]);

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
                className="h-14 w-20 shrink-0 rounded-lg bg-muted object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="size-6 text-muted-foreground/70" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-foreground line-clamp-1">{p.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">
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
          <span className="text-muted-foreground/70">—</span>
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
          <span className="text-foreground">{author?.name || "—"}</span>
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
        <span className="tabular-nums text-foreground">{row.original.viewCount || 0}</span>
      ),
    },
    {
      id: "date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày tạo" />,
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
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
            {canWrite && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => navigate(`/admin/posts/${id}/edit`)}
                aria-label="Sửa"
              >
                <Pencil className="size-4" />
              </Button>
            )}
            {(canWrite || canPublish || p.status === "published") && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Khác">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canWrite && (
                  <DropdownMenuItem onClick={() => navigate(`/admin/posts/${id}/edit`)}>
                    <Pencil className="size-4" />
                    Chỉnh sửa
                  </DropdownMenuItem>
                )}
                {p.status === "published" && (
                  <DropdownMenuItem asChild>
                    <a href={`/news/${p.slug}`} target="_blank" rel="noopener noreferrer">
                      <Eye className="size-4" />
                      Xem trang
                    </a>
                  </DropdownMenuItem>
                )}
                {canPublish && (
                  <>
                    <DropdownMenuSeparator />
                    {isPublished ? (
                      <DropdownMenuItem onClick={() => handleUnpublish(p)}>
                        <EyeOff className="size-4" />
                        Hủy xuất bản
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handlePublish(p)}>
                        <Globe className="size-4" />
                        Xuất bản
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {canWrite && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-danger-strong focus:bg-danger-muted focus:text-danger-strong"
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 className="size-4" />
                      Xóa
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>}
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
          <RotateCw className="size-4" />
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
        actions={canWrite ? (
          <Button asChild>
            <Link to="/admin/posts/new">
              <Plus className="size-4" />
              Thêm bài viết
            </Link>
          </Button>
        ) : null}
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
              action={canWrite ? (
                <Button asChild>
                  <Link to="/admin/posts/new">
                    <Plus className="size-4" />
                    Thêm bài viết
                  </Link>
                </Button>
              ) : null}
            />
          }
        />
      )}
    </div>
  );
}
