import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flame, BookOpen, TrendingUp, Sparkles } from "lucide-react";
import { booksAPI, categoriesAPI } from "@/services/api";
import BookCard from "@/components/book/BookCard";
import { BookGridSkeleton } from "@/components/book/BookCardSkeleton";
import RecommendationRail from "@/components/book/RecommendationRail";
import HeroCarousel from "@/components/layout/HeroCarousel";
import CategoryPills from "@/components/common/CategoryPills";
import CountdownTimer from "@/components/common/CountdownTimer";
import TrustBadgeRow from "@/components/common/TrustBadgeRow";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import useRecentlyViewed from "@/hooks/useRecentlyViewed";

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [allBooks, setAllBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { items: recentlyViewed } = useRecentlyViewed();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoriesRes, booksRes] = await Promise.all([
          categoriesAPI.getAll(),
          booksAPI.getAll(),
        ]);
        setCategories(categoriesRes.data?.categories || []);
        setAllBooks(booksRes.data?.books || []);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Flash sale ends at end of current day
  const flashEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const bestSellers = useMemo(
    () =>
      [...allBooks]
        .sort((a, b) => (b.sold || 0) - (a.sold || 0))
        .slice(0, 10),
    [allBooks]
  );

  const newArrivals = useMemo(
    () =>
      [...allBooks]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10),
    [allBooks]
  );

  // "Flash sale" = top rated & most affordable (simulated)
  const flashSaleBooks = useMemo(
    () =>
      [...allBooks]
        .filter((b) => (b.stock || 0) > 0)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.price - b.price)
        .slice(0, 10),
    [allBooks]
  );

  const booksByCategory = useMemo(() => {
    const map = {};
    categories.forEach((cat) => {
      const slug = cat.slug || cat._id || cat.id;
      map[slug] = allBooks
        .filter((b) => b.category === slug)
        .sort((a, b) => (b.sold || 0) - (a.sold || 0))
        .slice(0, 10);
    });
    return map;
  }, [categories, allBooks]);

  return (
    <div>
      <HeroCarousel />

      {/* Trust strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
        <TrustBadgeRow />
      </section>

      {/* Category pills */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <CategoryPills categories={categories} />
        </section>
      )}

      {loading ? (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <BookGridSkeleton count={10} />
        </section>
      ) : allBooks.length === 0 ? (
        <section className="py-12">
          <EmptyState
            icon={BookOpen}
            title="Chưa có sách nào"
            description="Vui lòng thêm danh mục và sách qua trang quản trị Admin để bắt đầu."
            action={
              <Button asChild>
                <Link to="/admin/categories">Thêm danh mục</Link>
              </Button>
            }
          />
        </section>
      ) : (
        <>
          {/* Flash Sale */}
          {flashSaleBooks.length > 0 && (
            <section className="bg-gradient-to-br from-red-50 via-orange-50 to-primary-50 py-10 mt-4">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
                      <Flame className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl lg:text-2xl font-display font-bold text-secondary-900">
                        Flash Sale hôm nay
                      </h2>
                      <p className="text-xs lg:text-sm text-secondary-600">
                        Săn ngay trước khi hết giờ!
                      </p>
                    </div>
                  </div>
                  <CountdownTimer target={flashEnd} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {flashSaleBooks.slice(0, 5).map((book, i) => (
                    <BookCard
                      key={book._id || book.id}
                      book={{
                        ...book,
                        discountPercent: 10 + ((i * 5) % 25),
                      }}
                      badge={i === 0 ? "bestseller" : undefined}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Best Sellers rail */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <RecommendationRail
              title="Bán chạy nhất"
              subtitle="Được hàng ngàn độc giả yêu thích"
              books={bestSellers}
              action={
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden lg:inline-flex"
                >
                  <Link to="/products?sort=bestseller">
                    Xem tất cả
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              }
            />
          </div>

          {/* New Arrivals */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <RecommendationRail
              title="Mới ra mắt"
              subtitle="Những tựa sách mới nhất dành cho bạn"
              books={newArrivals}
              action={
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden lg:inline-flex"
                >
                  <Link to="/products?sort=newest">
                    Xem tất cả
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              }
            />
          </div>

          {/* By Category */}
          {categories.map((category, idx) => {
            const slug = category.slug || category._id || category.id;
            const books = booksByCategory[slug] || [];
            if (books.length === 0) return null;
            return (
              <section
                key={slug}
                className={idx % 2 === 0 ? "bg-white py-8" : "bg-gray-50 py-8"}
              >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-8 bg-primary-500 rounded-full" />
                      <div>
                        <h2 className="text-xl lg:text-2xl font-display font-bold text-secondary-800">
                          {category.name}
                        </h2>
                        <p className="text-xs text-secondary-500">
                          {books.length} sản phẩm
                        </p>
                      </div>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/products?category=${slug}`}>
                        Xem tất cả
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-5">
                    {books.slice(0, 5).map((book, i) => (
                      <BookCard
                        key={book._id || book.id}
                        book={book}
                        badge={i === 0 ? "bestseller" : undefined}
                      />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}

          {/* Recently viewed */}
          {recentlyViewed.length > 0 && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 bg-white">
              <RecommendationRail
                title="Đã xem gần đây"
                subtitle="Tiếp tục khám phá những cuốn sách bạn đã quan tâm"
                books={recentlyViewed}
              />
            </div>
          )}

          {/* Categories overview */}
          {categories.length > 0 && (
            <section className="bg-white py-12 border-t border-gray-100">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-8">
                  <Badge variant="secondary" className="mb-3">
                    <Sparkles className="w-3 h-3" />
                    Khám phá theo thể loại
                  </Badge>
                  <h2 className="text-2xl lg:text-3xl font-display font-bold text-secondary-800">
                    Tất cả danh mục
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {categories.map((cat) => {
                    const slug = cat.slug || cat._id || cat.id;
                    const catBooks = booksByCategory[slug] || [];
                    return (
                      <Link
                        key={slug}
                        to={`/products?category=${slug}`}
                        className="group relative overflow-hidden rounded-2xl aspect-[4/5]"
                      >
                        <img
                          src={
                            cat.image ||
                            catBooks[0]?.imageUrl ||
                            "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400"
                          }
                          alt={cat.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute inset-0 bg-primary-600/0 group-hover:bg-primary-600/30 transition-colors duration-300" />
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          <h3 className="text-white font-semibold text-sm lg:text-base line-clamp-1">
                            {cat.name}
                          </h3>
                          <p className="text-white/70 text-xs mt-0.5">
                            {catBooks.length} sách
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
