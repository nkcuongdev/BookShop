import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flame } from "lucide-react";
import { booksAPI, categoriesAPI, eventsAPI } from "@/services/api";
import { BookGridSkeleton } from "@/components/book/BookCardSkeleton";
import RecommendationRail from "@/components/book/RecommendationRail";
import HomeBanners from "@/components/home/HomeBanners";
import MemberStrip from "@/components/home/MemberStrip";
import CategoryPills from "@/components/common/CategoryPills";
import CountdownTimer from "@/components/common/CountdownTimer";
import TrustBadgeRow from "@/components/common/TrustBadgeRow";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import useRecentlyViewed from "@/hooks/useRecentlyViewed";
import { useAuth } from "@/context/AuthContext.jsx";
import { isStaff } from "@/lib/rbac";
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
  const { user } = useAuth();

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
  const categorySections = categories
    .map((category) => {
      const slug = category.slug || category._id || category.id;
      return { category, slug, books: booksByCategory[slug] || [] };
    })
    .filter((entry) => entry.books.length > 0);
  const hasBooks =
    bestSellers.length > 0 ||
    newArrivals.length > 0 ||
    Object.values(booksByCategory).some((books) => books.length > 0);

  return (
    <div>
      {/* Banner cluster: image carousel + two fixed banners. Static artwork
          configured in features/home/banners.js — no API data involved. */}
      <HomeBanners />

      {/* Service commitments as one slim bar, directly under the banners. */}
      <section className="page-container pt-3 sm:pt-4">
        <TrustBadgeRow variant="strip" />
      </section>

      {/* Desktop reaches categories from the header's "Danh mục" menu; the
          pills stay for touch screens, where that menu lives in the drawer. */}
      {categories.length > 0 && (
        <section className="page-container pt-4 lg:hidden">
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
            description={
              isStaff(user)
                ? "Vui lòng thêm danh mục và sách qua trang quản trị Admin để bắt đầu."
                : "Cửa hàng đang cập nhật sách mới. Vui lòng quay lại sau nhé!"
            }
            action={
              isStaff(user) ? (
                <Button asChild>
                  <Link to="/admin/categories">Thêm danh mục</Link>
                </Button>
              ) : null
            }
          />
        </section>
      ) : (
        <>
          {/* Two related rails share one section so they read as a pair.
              Previously each carried its own py-8, producing 64px of dead space
              between the two most closely related blocks on the page. First
              after the banners, with a short top gap, so products show early. */}
          <div className="page-container space-y-12 pb-12 pt-8 lg:pb-16 lg:pt-10">
            <RecommendationRail
              title="Sách bán chạy"
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
              title="Sách mới ra mắt"
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

          {/* By category. These sit on the page background like the rails
              above instead of on full-width white slabs: four identical white
              blocks read as one repeated pattern, and the last one left a grey
              seam above the footer. The member strip after the second section
              breaks the run. On phones each row swipes sideways, so five books
              don't stack into three rows with an orphan. */}
          {categorySections.length > 0 && (
            <div className="page-container space-y-10 pb-4 lg:space-y-14 lg:pb-6">
              {categorySections.map(({ category, slug, books }, index) => (
                <Fragment key={slug}>
                  <section>
                    <SectionHeader
                      title={category.name}
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
                    <BookGrid
                      books={books.slice(0, 5)}
                      badgeFirst
                      stagger
                      mobileScroll
                    />
                  </section>
                  {index === Math.min(1, categorySections.length - 1) && (
                    <MemberStrip />
                  )}
                </Fragment>
              ))}
            </div>
          )}

          {/* Recently viewed */}
          {recentlyViewed.length > 0 && (
            <div className="page-container pb-12 lg:pb-16">
              <RecommendationRail
                title="Đã xem gần đây"
                subtitle="Tiếp tục khám phá những cuốn sách bạn đã quan tâm"
                books={recentlyViewed}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
