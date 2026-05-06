import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calendar, User, ArrowRight, Search, Filter } from "lucide-react";
import { usePublishedPosts, usePublicPostCategories } from "@/features/admin/posts/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import useDebounce from "@/hooks/useDebounce";
import { formatRelativeDate } from "@/utils/format";

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
    <Card className="group overflow-hidden transition-all hover:shadow-lg">
      <Link to={`/news/${post.slug}`} className="block">
        <div className="aspect-video overflow-hidden bg-gray-100">
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
          <h3 className="font-semibold text-lg text-secondary-800 line-clamp-2 group-hover:text-primary-600 transition-colors">
            {post.title}
          </h3>
        </Link>
        <p className="text-secondary-600 text-sm line-clamp-2">
          {post.shortDescription || "Không có mô tả"}
        </p>
        <div className="flex items-center gap-4 text-xs text-secondary-500 pt-2">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatRelativeDate(post.publishedAt || post.createdAt)}
          </span>
          {post.author && (
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
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

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCategory]);

  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 py-12 md:py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
            Tin tức & Blog
          </h1>
          <p className="text-primary-100 text-center max-w-2xl mx-auto mb-8">
            Cập nhật những tin tức mới nhất về sách, review sách và các bài viết
            hữu ích cho người yêu đọc sách
          </p>

          {/* Search */}
          <div className="max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm bài viết..."
                className="pl-12 h-12 bg-white border-0 shadow-lg"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Category Filter */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <Filter className="h-4 w-4 text-secondary-500" />
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
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📰</div>
            <h3 className="text-xl font-semibold text-secondary-800 mb-2">
              Không tìm thấy bài viết
            </h3>
            <p className="text-secondary-600 mb-4">
              {search
                ? `Không có bài viết nào phù hợp với "${search}"`
                : "Chưa có bài viết nào trong danh mục này"}
            </p>
            {(search || selectedCategory !== "all") && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
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
            {pagination.totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-10">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Trang trước
                </Button>
                <span className="px-4 py-2 text-sm text-secondary-600">
                  Trang {page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  Trang sau
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
