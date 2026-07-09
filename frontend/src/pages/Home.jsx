import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flame, Sparkles } from "lucide-react";
import { booksAPI, categoriesAPI, eventsAPI } from "@/services/api";
import { BookGridSkeleton } from "@/components/book/BookCardSkeleton";
import RecommendationRail from "@/components/book/RecommendationRail";
import HomeHero from "@/components/layout/HomeHero";
import CategoryPills from "@/components/common/CategoryPills";
import CountdownTimer from "@/components/common/CountdownTimer";
import TrustBadgeRow from "@/components/common/TrustBadgeRow";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import useRecentlyViewed from "@/hooks/useRecentlyViewed";
import BookCover from "@/components/book/BookCover";
import SectionHeader from "@/components/common/SectionHeader";
import BookGrid from "@/components/book/BookGrid";

import { EmptyShelfIllustration } from "@/components/common/illustrations";
export default function Home() {
  const [categories, setCategories] = useState([]);
  const [homeBooks, setHomeBooks] = useState({
    bestSellers: [],
    newArrivals: [],
    flashSale: [],
    booksByCategory: {},
  });
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState({
    books: [],
    personalized: false,
    basis: { views: 0, purchases: 0 },
  });
  const { items: recentlyViewed } = useRecentlyViewed();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoriesResult, booksResult, recommendationsResult] =
          await Promise.allSettled([
            categoriesAPI.getAll(),
            booksAPI.getHome(),
            booksAPI.getRecommendations({
              sessionId: eventsAPI.getSessionId(),
              limit: 10,
            }),
          ]);
        if (categoriesResult.status === "fulfilled") {
          setCategories(categoriesResult.value.data?.categories || []);
        }
        if (booksResult.status === "fulfilled") {
          setHomeBooks((current) => ({
            ...current,
            ...(booksResult.value.data || {}),
          }));
        }
        if (recommendationsResult.status === "fulfilled") {
          setRecommendations((current) => ({
            ...current,
            ...(recommendationsResult.value.data || {}),
          }));
        }
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

  const {
    bestSellers,
    newArrivals,
    flashSale: flashSaleBooks,
    booksByCategory,
  } = homeBooks;
  const hasBooks =
    bestSellers.length > 0 ||
    newArrivals.length > 0 ||
    Object.values(booksByCategory).some((books) => books.length > 0);

  return (
    <div>
      {/* The hero's shelf is fixed artwork, so it takes no data and renders
          complete on first paint — no placeholder, no shift when the API
          answers. `homeBooks` still drives every real product section below. */}
      <HomeHero />

      {/* Trust strip. Was pulled up with -mt-6 to overlap the old hero's dark
          gradient and hide the seam; the light hero has no seam to hide, so it
          is a normal section now. */}
      <section className="page-container section-tight">
        <TrustBadgeRow />
      </section>

      {/* Category pills */}
      {categories.length > 0 && (
        <section className="page-container section-tight">
          <CategoryPills categories={categories} />
        </section>
      )}

      {loading ? (
        <section className="page-container section-tight">
          <BookGridSkeleton count={10} />
        </section>
      ) : !hasBooks ? (
        /* Was missing a container entirely, so the copy touched the viewport
           edge on mobile. */
        <section className="page-container section-base">
          <EmptyState
            illustration={EmptyShelfIllustration}
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
            <section className="section-base bg-gradient-to-br from-danger-muted via-brand-muted to-primary-50">
              <div className="page-container">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="size-11 rounded-xl bg-gradient-to-br from-danger-strong to-brand-vivid flex items-center justify-center shadow-lift animate-pulse">
                      <Flame className="size-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-h3 lg:text-h2 font-display font-bold text-foreground">
                        Flash Sale hôm nay
                      </h2>
                      <p className="text-xs lg:text-sm text-muted-foreground">
                        Săn ngay trước khi hết giờ!
                      </p>
                    </div>
                  </div>
                  <CountdownTimer target={flashEnd} />
                </div>

                <BookGrid books={flashSaleBooks.slice(0, 5)} badgeFirst stagger />
              </div>
            </section>
          )}

          {recommendations.personalized && recommendations.books.length > 0 && (
            <section className="section-base bg-gradient-to-br from-primary-50 via-card to-brand-muted">
              <div className="page-container">
                <RecommendationRail
                  title="Dành riêng cho bạn"
                  subtitle="Dựa trên những cuốn sách bạn đã xem và mua"
                  books={recommendations.books}
                />
              </div>
            </section>
          )}

          {/* Two related rails share one section so they read as a pair.
              Previously each carried its own py-8, producing 64px of dead space
              between the two most closely related blocks on the page. */}
          <div className="page-container section-base space-y-12">
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
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />

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
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            />
          </div>

          {/* By Category */}
          {categories.map((category) => {
            const slug = category.slug || category._id || category.id;
            const books = booksByCategory[slug] || [];
            if (books.length === 0) return null;
            return (
              /* Previously alternated bg-card / bg-muted by index — but the page
                 itself is bg-muted (MainLayout), so every other stripe was
                 invisible and the pattern depended on how many categories had
                 books. Now every category section is a card surface, separated
                 by rhythm rather than a data-dependent stripe. */
              <section key={slug} className="section-base bg-card">
                <div className="page-container">
                  <SectionHeader
                    title={category.name}
                    subtitle={`${books.length} sản phẩm`}
                    size="lg"
                    action={
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/products?category=${slug}`}>
                          Xem tất cả
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    }
                  />
                  <BookGrid books={books.slice(0, 5)} badgeFirst stagger />
                </div>
              </section>
            );
          })}

          {/* Recently viewed */}
          {recentlyViewed.length > 0 && (
            /* bg-card was on the max-w element itself, producing a 1280px slab
               with hard edges unlike every other full-bleed section. */
            <section className="section-base bg-card">
              <div className="page-container">
                <RecommendationRail
                  title="Đã xem gần đây"
                  subtitle="Tiếp tục khám phá những cuốn sách bạn đã quan tâm"
                  books={recentlyViewed}
                />
              </div>
            </section>
          )}

          {/* Categories overview */}
          {categories.length > 0 && (
            <section className="section-loose border-t border-border bg-card">
              <div className="page-container">
                <div className="text-center mb-8">
                  <Badge variant="secondary" className="mb-3">
                    <Sparkles className="size-3" />
                    Khám phá theo thể loại
                  </Badge>
                  <h2 className="text-h3 lg:text-h2 font-display font-bold text-foreground">
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
                        {/* Was falling back to a hardcoded Unsplash URL — a
                            third-party request that renders broken if it fails.
                            BookCover degrades to a tinted initial instead. */}
                        <BookCover
                          src={cat.image || catBooks[0]?.imageUrl}
                          title={cat.name}
                          size="full"
                          ratio="free"
                          zoomOnHover
                          className="h-full w-full rounded-none"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/30 transition-colors duration-300" />
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
