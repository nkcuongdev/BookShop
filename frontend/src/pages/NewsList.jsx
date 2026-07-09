import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calendar, User, Search, Filter } from "lucide-react";
import { usePublishedPosts, usePublicPostCategories } from "@/features/admin/posts/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import useDebounce from "@/hooks/useDebounce";
import { formatRelativeDate } from "@/utils/format";
import Pagination from "@/components/ui/pagination";

function PostCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex items-center gap-4 pt-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function PostCard({ post }) {
  return (
    <Card interactive className="group overflow-hidden">
      <Link to={`/news/${post.slug}`} className="block">
        <div className="aspect-video overflow-hidden bg-muted">
          {post.thumbnail ? (
            <img
              src={post.thumbnail}
              alt={post.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
              <span className="text-4xl font-bold text-primary-400">
                {post.title?.[0]?.toUpperCase() || "B"}
              </span>
            </div>
          )}
        </div>
      </Link>
      <CardContent className="p-4 space-y-3">
        {post.category && (
          <Badge variant="secondary" className="text-xs">
            {post.category.name}
          </Badge>
        )}
        <Link to={`/news/${post.slug}`}>
          <h3 className="font-semibold text-h3 text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {post.title}
          </h3>
        </Link>
        <p className="text-muted-foreground text-sm line-clamp-2">
          {post.shortDescription || "Không có mô tả"}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
          <span className="flex items-center gap-1">
            <Calendar className="size-4" />
            {formatRelativeDate(post.publishedAt || post.createdAt)}
          </span>
          {post.author && (
            <span className="flex items-center gap-1">
              <User className="size-4" />
              {post.author.name}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function NewsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get("category") || "all"
  );
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 300);

  const categoriesQ = usePublicPostCategories();
  const postsQ = usePublishedPosts({
    page,
    limit: 12,
    category: selectedCategory !== "all" ? selectedCategory : undefined,
    search: debouncedSearch || undefined,
  });

  const categories = categoriesQ.data || [];
  const posts = postsQ.data?.posts || [];
  const pagination = postsQ.data?.pagination || { total: 0, totalPages: 1 };

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (selectedCategory !== "all") params.set("category", selectedCategory);
    setSearchParams(params, { replace: true });
  }, [search, selectedCategory, setSearchParams]);

  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-muted">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-800 to-deep-soft section-base">
        <div className="page-container">
          <h1 className="mb-4 text-center text-h1 font-display font-bold text-white lg:text-display">
            Tin tức & Blog
          </h1>
          <p className="text-primary-100 text-center max-w-2xl mx-auto mb-8">
            Cập nhật những tin tức mới nhất về sách, review sách và các bài viết
            hữu ích cho người yêu đọc sách
          </p>

          {/* Search */}
          <div className="max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground/70" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm kiếm bài viết..."
                className="pl-12 h-12 bg-card border-0 shadow-float"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="page-container section-tight">
        {/* Category Filter */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <Filter className="size-4 text-muted-foreground" />
          <Button
            variant={selectedCategory === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => handleCategoryChange("all")}
          >
            Tất cả
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat._id || cat.id}
              variant={selectedCategory === (cat._id || cat.id) ? "default" : "outline"}
              size="sm"
              onClick={() => handleCategoryChange(cat._id || cat.id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Posts Grid */}
        {postsQ.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center section-base">
            <div className="text-6xl mb-4">📰</div>
            <h3 className="text-h3 font-semibold text-foreground mb-2">
              Không tìm thấy bài viết
            </h3>
            <p className="text-muted-foreground mb-4">
              {search
                ? `Không có bài viết nào phù hợp với "${search}"`
                : "Chưa có bài viết nào trong danh mục này"}
            </p>
            {(search || selectedCategory !== "all") && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                  setSelectedCategory("all");
                }}
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {posts.map((post) => (
                <PostCard key={post._id || post.id} post={post} />
              ))}
            </div>

            {/* Pagination */}
            <Pagination
              page={page}
              totalPages={pagination.totalPages}
              onChange={setPage}
              className="mt-10"
            />
          </>
        )}
      </div>
    </div>
  );
}
