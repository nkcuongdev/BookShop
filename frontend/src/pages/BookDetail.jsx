import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Heart,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Zap,
} from "lucide-react";
import { booksAPI, categoriesAPI } from "@/services/api";
import { useAuth } from "@/context/AuthContext.jsx";
import { useCart } from "@/context/CartContext.jsx";
import { formatVND, getPriceInfo, formatCompact } from "@/utils/format";
import useRecentlyViewed from "@/hooks/useRecentlyViewed";
import useWishlist from "@/hooks/useWishlist";
import { cn } from "@/lib/utils";

import Rating from "@/components/common/Rating";
import PriceTag from "@/components/common/PriceTag";
import QuantityInput from "@/components/common/QuantityInput";
import TrustBadgeRow from "@/components/common/TrustBadgeRow";
import EmptyState from "@/components/common/EmptyState";
import BookCard from "@/components/book/BookCard";
import RecommendationRail from "@/components/book/RecommendationRail";
import ReviewList from "@/components/review/ReviewList";
import ReviewForm from "@/components/review/ReviewForm";
import RatingSummary from "@/components/review/RatingSummary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "@/components/ui/sonner";

function DetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid lg:grid-cols-2 gap-10">
        <Skeleton className="aspect-[3/4] max-w-md rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function BookDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addItem } = useCart();
  const { add: addRecent } = useRecentlyViewed();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();

  const [book, setBook] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [relatedBooks, setRelatedBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [bookRes, categoriesRes] = await Promise.all([
          booksAPI.getById(id),
          categoriesAPI.getAll(),
        ]);

        if (!active) return;

        if (bookRes.success) {
          const bk = bookRes.data.book;
          setBook(bk);
          setReviews(bookRes.data.reviews || []);
          addRecent(bk);

          try {
            const relatedRes = await booksAPI.getAll({
              category: bk.category,
              limit: 8,
            });
            if (active && relatedRes.success) {
              setRelatedBooks(
                (relatedRes.data.books || [])
                  .filter((b) => (b._id || b.id) !== id)
                  .slice(0, 6),
              );
            }
          } catch {
            /* noop */
          }
        }

        if (categoriesRes.success) setCategories(categoriesRes.data.categories);

        if (user) {
          try {
            const canRes = await booksAPI.canReview(id);
            if (active && canRes.success) setCanReview(!!canRes.data.canReview);
          } catch {
            /* noop */
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  const category = useMemo(
    () =>
      categories.find(
        (c) => (c.slug || c._id || c.id) === (book?.category || ""),
      ),
    [categories, book],
  );

  const { price, originalPrice, discountPercent } = getPriceInfo(book || {});

  const images = useMemo(() => {
    if (!book) return [];
    const list = [book.imageUrl, ...(book.gallery || [])].filter(Boolean);
    return Array.from(new Set(list));
  }, [book]);

  useEffect(() => {
    setActiveImage(0);
  }, [book?._id, book?.id]);

  const formattedPublishedDate = useMemo(() => {
    if (!book?.publishedDate) return null;
    const d = new Date(book.publishedDate);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("vi-VN");
  }, [book?.publishedDate]);

  const formattedDimensions = useMemo(() => {
    const d = book?.dimensions;
    if (!d) return null;
    const parts = [d.length, d.width, d.height].filter(
      (n) => n !== null && n !== undefined && n !== "",
    );
    return parts.length ? `${parts.join(" × ")} cm` : null;
  }, [book?.dimensions]);

  // Spec rows – only include entries with a real value.
  const specRows = useMemo(() => {
    if (!book) return [];
    const rows = [
      ["Tác giả", book.author],
      ["Thể loại", category?.name],
      ["Nhà xuất bản", book.publisher],
      ["Ngày xuất bản", formattedPublishedDate],
      ["ISBN", book.isbn],
      ["Số trang", book.pages ? `${book.pages} trang` : null],
      ["Ngôn ngữ", book.language],
      ["Cân nặng", book.weight ? `${book.weight} g` : null],
      ["Kích thước", formattedDimensions],
    ];
    const customRows = Array.isArray(book.attributes)
      ? book.attributes
          .filter((a) => a?.key && (a.value ?? "") !== "")
          .map((a) => [a.key, a.value])
      : [];
    return [...rows, ...customRows].filter(
      ([, v]) => v !== null && v !== undefined && v !== "",
    );
  }, [book, category, formattedPublishedDate, formattedDimensions]);

  const handleAddToCart = () => {
    if (!book) return;
    const result = addItem(book, quantity);
    if (!result?.success) {
      toast.error("Số lượng trong giỏ đã đạt mức còn hàng");
      return;
    }
    toast.success("Đã thêm vào giỏ hàng", {
      description: result.capped
        ? `${book.title} - đã thêm số lượng còn lại`
        : `${book.title} × ${quantity}`,
    });
  };

  const handleBuyNow = () => {
    if (!book) return;
    const result = addItem(book, quantity);
    if (!result?.success && result?.reason !== "limit_reached") {
      toast.error("Số lượng trong giỏ đã đạt mức còn hàng");
      return;
    }
    window.location.href = "/checkout";
  };

  const handleSubmitReview = async (rating, comment) => {
    setSubmittingReview(true);
    try {
      const response = await booksAPI.createReview(id, rating, comment);
      if (response.success) {
        setReviews((prev) => [response.data.review, ...prev]);
        setBook((prev) => ({
          ...prev,
          rating: response.data.bookRating,
          reviewCount: response.data.bookReviewCount,
        }));
        setCanReview(false);
        toast.success("Cảm ơn bạn đã đánh giá!");
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: book?.title,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Đã copy link sản phẩm");
    }
  };

  if (loading) return <DetailSkeleton />;

  if (!book) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Không tìm thấy sách"
        description="Cuốn sách bạn tìm không tồn tại hoặc đã bị gỡ."
        action={
          <Button asChild>
            <Link to="/products">
              <ArrowLeft className="w-4 h-4" />
              Về danh sách sách
            </Link>
          </Button>
        }
      />
    );
  }

  const bookId = book._id || book.id;
  const wished = isWishlisted(bookId);
  const outOfStock = book.stock === 0;
  const lowStock = book.stock > 0 && book.stock < 10;

  return (
    <div className="min-h-screen pb-32 lg:pb-0">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Trang chủ</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={`/products?category=${book.category}`}>
                    {category?.name || "Sách"}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate max-w-[220px]">
                  {book.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      {/* Product section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10 p-5 lg:p-8">
            {/* Gallery */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <div className="relative aspect-[3/4] max-w-md mx-auto rounded-2xl overflow-hidden bg-gray-100 shadow-lg">
                  <img
                    src={images[activeImage] || book.imageUrl}
                    alt={book.title}
                    className="w-full h-full object-cover transition-opacity duration-200"
                  />
                  <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
                    {discountPercent > 0 && (
                      <Badge variant="sale">-{discountPercent}%</Badge>
                    )}
                    {book.sold > 300 && (
                      <Badge variant="bestseller">Best seller</Badge>
                    )}
                  </div>
                </div>

                {/* Gallery thumbnails */}
                {images.length > 1 && (
                  <div className="mt-3 max-w-md mx-auto">
                    <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                      {images.map((src, idx) => (
                        <button
                          key={src + idx}
                          type="button"
                          onClick={() => setActiveImage(idx)}
                          className={cn(
                            "h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-gray-50 snap-start transition",
                            idx === activeImage
                              ? "border-primary-500 ring-2 ring-primary-100"
                              : "border-transparent opacity-70 hover:opacity-100",
                          )}
                          aria-label={`Ảnh ${idx + 1}`}
                        >
                          <img
                            src={src}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Share + wishlist */}
                <div className="flex items-center justify-center gap-2 mt-4 max-w-md mx-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!user) {
                        toast.error("Vui lòng đăng nhập để lưu yêu thích");
                        return;
                      }
                      const currentlyWished = wished;
                      const res = await toggleWishlist(book);
                      if (!res?.success) {
                        toast.error(
                          res?.message || "Không thể cập nhật yêu thích",
                        );
                        return;
                      }
                      toast.success(
                        currentlyWished
                          ? "Đã bỏ khỏi yêu thích"
                          : "Đã thêm vào yêu thích",
                      );
                    }}
                    className={cn(wished && "text-red-500 border-red-200")}
                  >
                    <Heart
                      className={cn("w-4 h-4", wished && "fill-current")}
                    />
                    {wished ? "Đã yêu thích" : "Yêu thích"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="w-4 h-4" />
                    Chia sẻ
                  </Button>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="lg:col-span-3 space-y-5">
              <div>
                {category && (
                  <Link
                    to={`/products?category=${book.category}`}
                    className="text-xs font-semibold text-primary-600 uppercase tracking-wider hover:underline"
                  >
                    {category.name}
                  </Link>
                )}
                <h1 className="text-2xl lg:text-3xl font-display font-bold text-secondary-800 mt-1.5 leading-tight">
                  {book.title}
                </h1>
                <p className="mt-1.5 text-secondary-500 text-sm">
                  Tác giả:{" "}
                  <span className="font-medium text-secondary-700">
                    {book.author}
                  </span>
                  {book.publisher && (
                    <>
                      <span className="mx-2 text-secondary-300">•</span>
                      NXB:{" "}
                      <span className="font-medium text-secondary-700">
                        {book.publisher}
                      </span>
                    </>
                  )}
                </p>

                {Array.isArray(book.tags) && book.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {book.tags.map((t) => (
                      <Link
                        key={t}
                        to={`/products?tag=${encodeURIComponent(t)}`}
                        className="inline-flex items-center rounded-full border border-primary-100 bg-primary-50/50 px-2.5 py-0.5 text-xs text-primary-700 hover:bg-primary-50"
                      >
                        #{t}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Rating row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Rating value={book.rating} size="md" />
                  <span className="font-semibold text-secondary-800">
                    {Number(book.rating || 0).toFixed(1)}
                  </span>
                  <a
                    href="#reviews"
                    className="text-sm text-primary-600 hover:underline"
                  >
                    ({book.reviewCount || 0} đánh giá)
                  </a>
                </div>
                <span className="text-secondary-300">|</span>
                <span className="text-sm text-secondary-500">
                  Đã bán{" "}
                  <span className="font-semibold text-secondary-700">
                    {formatCompact(book.sold || 0)}
                  </span>
                </span>
                <span className="text-secondary-300">|</span>
                <span
                  className={cn(
                    "text-sm font-medium flex items-center gap-1",
                    outOfStock
                      ? "text-red-500"
                      : lowStock
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {outOfStock ? "Hết hàng" : "Còn hàng"}
                </span>
              </div>

              {/* Price */}
              <div className="bg-gradient-to-br from-primary-50/60 to-orange-50/40 rounded-2xl p-5 border border-primary-100/50">
                <PriceTag
                  price={price}
                  originalPrice={originalPrice}
                  size="2xl"
                  showSaved
                />
                {discountPercent > 0 && (
                  <p className="text-xs text-secondary-500 mt-2">
                    Giá đã bao gồm VAT. Áp dụng đến hết hôm nay.
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-secondary-700">
                  Số lượng
                </span>
                <QuantityInput
                  value={quantity}
                  onChange={setQuantity}
                  max={Math.max(book.stock || 1, 1)}
                />
              </div>

              {/* CTA - desktop */}
              <div className="hidden lg:flex gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleAddToCart}
                  disabled={outOfStock}
                  className="flex-1"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Thêm vào giỏ
                </Button>
                <Button
                  size="lg"
                  onClick={handleBuyNow}
                  disabled={outOfStock}
                  className="flex-1"
                >
                  <Zap className="w-5 h-5" />
                  Mua ngay
                </Button>
              </div>

              {/* Trust */}
              <div className="pt-4 border-t border-gray-100">
                <TrustBadgeRow variant="inline" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs: Description / Specs / Reviews */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <Tabs defaultValue="description" className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="description">Mô tả</TabsTrigger>
            <TabsTrigger value="specs">Thông số</TabsTrigger>
            <TabsTrigger value="reviews" id="reviews">
              Đánh giá ({book.reviewCount || reviews.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="description">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-display font-bold text-secondary-800 mb-3">
                Mô tả sản phẩm
              </h2>
              {book.description ? (
                <div className="relative">
                  <div
                    className={cn(
                      "prose prose-sm max-w-none text-secondary-700 leading-relaxed whitespace-pre-line",
                      !descExpanded && "line-clamp-[10]",
                    )}
                  >
                    {book.description}
                  </div>
                  {book.description.length > 500 && (
                    <Button
                      variant="link"
                      className="mt-2 h-auto p-0"
                      onClick={() => setDescExpanded((v) => !v)}
                    >
                      {descExpanded ? "Thu gọn" : "Xem thêm"}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-secondary-500 italic">
                  Chưa có mô tả cho sách này.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="specs">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-display font-bold text-secondary-800 mb-4">
                Thông số chi tiết
              </h2>
              <dl className="divide-y divide-gray-100">
                {specRows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 py-3 text-sm gap-4">
                    <dt className="text-secondary-500">{k}</dt>
                    <dd className="col-span-2 text-secondary-800 font-medium break-words">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="space-y-6">
            <RatingSummary
              rating={book.rating}
              reviewCount={book.reviewCount}
              reviews={reviews}
            />

            {user ? (
              canReview ? (
                <div>
                  <h3 className="text-base font-display font-bold text-secondary-800 mb-3">
                    Đánh giá của bạn
                  </h3>
                  <ReviewForm
                    onSubmit={handleSubmitReview}
                    submitting={submittingReview}
                  />
                </div>
              ) : (
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-sm text-sky-800">
                  <ShieldCheck className="inline-block w-4 h-4 mr-1.5" />
                  Bạn cần mua sách này mới có thể đánh giá.
                </div>
              )
            ) : (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-secondary-600">
                <Link
                  to="/login"
                  className="text-primary-600 font-semibold hover:underline"
                >
                  Đăng nhập
                </Link>{" "}
                để chia sẻ đánh giá của bạn.
              </div>
            )}

            <ReviewList reviews={reviews} />
          </TabsContent>
        </Tabs>
      </section>

      {/* Related books */}
      {relatedBooks.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-100">
          <RecommendationRail
            title="Khách hàng cũng mua"
            subtitle="Những cuốn sách liên quan bạn có thể thích"
            books={relatedBooks}
          />
        </section>
      )}

      {/* Sticky mobile CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-2xl p-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={handleAddToCart}
          disabled={outOfStock}
          className="flex-1"
        >
          <ShoppingCart className="w-4 h-4" />
          Giỏ hàng
        </Button>
        <Button
          size="lg"
          onClick={handleBuyNow}
          disabled={outOfStock}
          className="flex-1"
        >
          <Zap className="w-4 h-4" />
          Mua ngay
        </Button>
      </div>
    </div>
  );
}
