import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Heart,
  Share2,
  ShoppingCart,
  Zap,
} from "lucide-react";
import { booksAPI, categoriesAPI, eventsAPI } from "@/services/api";
import { useAuth } from "@/context/AuthContext.jsx";
import { useCart } from "@/context/CartContext.jsx";
import { getPriceInfo, formatCompact } from "@/utils/format";
import { saveBuyNowSelection } from "@/utils/buyNow";
import useRecentlyViewed from "@/hooks/useRecentlyViewed";
import useWishlist from "@/hooks/useWishlist";
import { useConfirm } from "@/hooks/useConfirm";
import useDocumentMetadata, { getSiteUrl } from "@/hooks/useDocumentMetadata";
import { cn } from "@/lib/utils";

import Rating from "@/components/common/Rating";
import PriceTag from "@/components/common/PriceTag";
import QuantityInput from "@/components/common/QuantityInput";
import TrustBadgeRow from "@/components/common/TrustBadgeRow";
import EmptyState from "@/components/common/EmptyState";
import RecommendationRail from "@/components/book/RecommendationRail";
import BookDetailTabs from "@/components/book/BookDetailTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import BookCover from "@/components/book/BookCover";
import StickyMobileBar from "@/components/common/StickyMobileBar";
import PageHeader from "@/components/common/PageHeader";

import useCopyToClipboard from "@/hooks/useCopyToClipboard";
function DetailSkeleton() {
  return (
    /* Mirrors the loaded layout: lg:grid-cols-5 split 2/3, not 2 equal columns —
       otherwise the page jumps sideways when data arrives. */
    <div className="page-container py-6">
      <div className="grid gap-6 lg:grid-cols-5 lg:gap-10">
        <div className="lg:col-span-2">
          <Skeleton className="mx-auto aspect-[3/4] max-w-md rounded-3xl" />
        </div>
        <div className="space-y-4 lg:col-span-3">
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

function plainText(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function BookDetail() {
  const { copy } = useCopyToClipboard();
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const { addItem } = useCart();
  const { add: addRecent } = useRecentlyViewed();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const confirm = useConfirm();

  const [book, setBook] = useState(null);
  const [loadedBookId, setLoadedBookId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [reviewPagination, setReviewPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [ratingBreakdown, setRatingBreakdown] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  // Mirrors `reviews` so a submit handler can read the current list without
  // depending on a closure captured when the handler was created.
  const reviewsRef = useRef([]);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [relatedBooks, setRelatedBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [canReview, setCanReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      setBook(null);
      setReviews([]);
      setRatingBreakdown(null);
      setReviewRating(0);
      setRelatedBooks([]);
      setCanReview(false);
      setHasReviewed(false);
      setQuantity(1);
      setDescExpanded(false);
      setActiveImage(0);
      try {
        const [bookResult, categoriesResult] = await Promise.allSettled([
          booksAPI.getById(id),
          categoriesAPI.getAll(),
        ]);

        if (!active) return;
        if (bookResult.status === "rejected") throw bookResult.reason;
        const bookRes = bookResult.value;
        if (!bookRes.success || !bookRes.data?.book) {
          throw new Error("Không tìm thấy sách");
        }

        const bk = bookRes.data.book;
        setBook(bk);
        setLoadedBookId(id);
        setReviews(bookRes.data.reviews || []);
        setRatingBreakdown(bookRes.data.ratingBreakdown || null);
        setReviewPagination(
          bookRes.data.reviewPagination || {
            page: 1,
            totalPages: 1,
            total: (bookRes.data.reviews || []).length,
          },
        );
        addRecent(bk);
        eventsAPI.track({
          type: "product_view",
          bookId: bk._id || bk.id,
          metadata: { title: bk.title, category: bk.category },
        });

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
          /* Related products are non-critical. */
        }
        if (!active) return;

        if (
          categoriesResult.status === "fulfilled" &&
          categoriesResult.value.success
        ) {
          setCategories(categoriesResult.value.data.categories);
        }

        if (user) {
          try {
            const canRes = await booksAPI.canReview(id);
            if (active && canRes.success) {
              setCanReview(!!canRes.data.canReview);
              setHasReviewed(!!canRes.data.hasReviewed);
            }
          } catch {
            /* noop */
          }
        }
      } catch (e) {
        if (active) {
          setBook(null);
          setLoadedBookId(id);
          setLoadError(e.message || "Không thể tải thông tin sách");
        }
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
  }, [id, retryVersion, user?.id]);

  const category = useMemo(
    () =>
      categories.find(
        (c) => (c.slug || c._id || c.id) === (book?.category || ""),
      ),
    [categories, book],
  );

  const { price, originalPrice, discountPercent } = getPriceInfo(book || {});

  const bookDescription = useMemo(() => {
    const value = plainText(book?.description || "");
    return value
      ? value.slice(0, 160)
      : book
        ? `Mua ${book.title} của ${book.author} tại BookShop.`
        : "Khám phá thông tin chi tiết sách tại BookShop.";
  }, [book]);
  const bookStructuredData = useMemo(() => {
    if (!book) return null;
    const bookId = book._id || book.id;
    const siteUrl = getSiteUrl();
    return {
      "@context": "https://schema.org",
      "@type": "Book",
      "@id": `${siteUrl}/books/${bookId}#book`,
      url: `${siteUrl}/books/${bookId}`,
      name: book.title,
      author: { "@type": "Person", name: book.author },
      description: bookDescription,
      image: book.imageUrl ? new URL(book.imageUrl, siteUrl).toString() : undefined,
      isbn: book.isbn || undefined,
      inLanguage: book.language || "vi",
      numberOfPages: book.pages || undefined,
      publisher: book.publisher ? { "@type": "Organization", name: book.publisher } : undefined,
      offers: {
        "@type": "Offer",
        price: Number(price || 0),
        priceCurrency: "VND",
        availability:
          Number(book.stock || 0) > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        url: `${siteUrl}/books/${bookId}`,
      },
      aggregateRating:
        Number(book.reviewCount || 0) > 0
          ? {
              "@type": "AggregateRating",
              ratingValue: Number(book.rating || 0),
              reviewCount: Number(book.reviewCount),
              bestRating: 5,
              worstRating: 1,
            }
          : undefined,
    };
  }, [book, bookDescription, price]);

  useDocumentMetadata({
    title: book ? `${book.title} – ${book.author} | BookShop` : "Chi tiết sách | BookShop",
    description: bookDescription,
    canonicalPath: `/books/${id}`,
    image: book?.imageUrl,
    type: "book",
    structuredData: bookStructuredData,
  });

  const images = useMemo(() => {
    if (!book) return [];
    const list = [book.imageUrl, ...(book.gallery || [])].filter(Boolean);
    return Array.from(new Set(list));
  }, [book]);

  const publishedYear = useMemo(() => {
    if (!book?.publishedDate) return null;
    const d = new Date(book.publishedDate);
    return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
  }, [book]);

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
      ["Năm xuất bản", publishedYear],
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
  }, [book, category, publishedYear, formattedDimensions]);

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
      action: {
        label: "Xem giỏ",
        onClick: () => navigate("/cart"),
      },
    });
    eventsAPI.track({
      type: "add_to_cart",
      bookId: book._id || book.id,
      metadata: { quantity: result.addedQuantity },
    });
  };

  // "Mua ngay" checks out this book alone. It deliberately does not touch the
  // cart, so anything already in there is neither ordered nor cleared.
  const handleBuyNow = () => {
    if (!book) return;
    const selection = saveBuyNowSelection(book, quantity);
    if (!selection) {
      toast.error("Số lượng không hợp lệ");
      return;
    }
    navigate("/checkout", { state: { buyNow: selection } });
  };

  // The histogram comes from the server, so a review the reader just added,
  // edited, or removed has to be folded into it locally until the next load.
  const applyBreakdownDelta = (previousRating, nextRating) => {
    setRatingBreakdown((current) => {
      if (!current) return current;
      const updated = { ...current };
      const prevStar = Math.floor(Number(previousRating));
      const nextStar = Math.floor(Number(nextRating));
      if (prevStar >= 1 && prevStar <= 5) {
        updated[prevStar] = Math.max(0, (Number(updated[prevStar]) || 0) - 1);
      }
      if (nextStar >= 1 && nextStar <= 5) {
        updated[nextStar] = (Number(updated[nextStar]) || 0) + 1;
      }
      return updated;
    });
  };

  const handleSubmitReview = async (rating, comment, images) => {
    setSubmittingReview(true);
    try {
      const response = await booksAPI.createReview(id, rating, comment, images);
      if (response.success) {
        const createdReview = response.data.review;
        const createdId = String(createdReview?._id || createdReview?.id || "");
        // A resubmit replaces the reader's existing review, so its old star has
        // to come back out of the histogram.
        const replacedReview = reviewsRef.current.find(
          (item) => String(item?._id || item?.id || "") === createdId,
        );
        applyBreakdownDelta(replacedReview?.rating, createdReview?.rating);
        setReviews((prev) => {
          const withoutCurrent = prev.filter(
            (item) => String(item?._id || item?.id || "") !== createdId,
          );
          return createdReview ? [createdReview, ...withoutCurrent] : prev;
        });
        setBook((prev) => ({
          ...prev,
          rating: response.data.bookRating,
          reviewCount: response.data.bookReviewCount,
        }));
        setCanReview(false);
        setHasReviewed(true);
        setReviewPagination((prev) => {
          const total = response.data.bookReviewCount ?? prev.total;
          return {
            ...prev,
            total,
            totalPages: Math.ceil(total / 10),
          };
        });
        toast.success(
          response.data.alreadyReviewed
            ? "Đánh giá của bạn đã được hiển thị."
            : "Cảm ơn bạn đã đánh giá!",
        );
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleEditReview = async (review, rating, comment, images) => {
    const reviewId = review._id || review.id;
    const response = await booksAPI.updateReview(id, reviewId, rating, comment, images);
    if (!response.success) return;
    applyBreakdownDelta(review.rating, response.data.review?.rating);
    setReviews((current) =>
      current.map((item) =>
        String(item._id || item.id) === String(reviewId) ? response.data.review : item,
      ),
    );
    setBook((current) => ({
      ...current,
      rating: response.data.bookRating,
      reviewCount: response.data.bookReviewCount,
    }));
    toast.success("Đã cập nhật đánh giá");
  };

  const handleDeleteReview = async (review) => {
    const accepted = await confirm({
      title: "Xóa đánh giá?",
      description: "Đánh giá sẽ bị xóa vĩnh viễn và không thể khôi phục.",
      confirmText: "Xóa",
      variant: "destructive",
    });
    if (!accepted) return;
    try {
      const reviewId = review._id || review.id;
      const response = await booksAPI.deleteReview(id, reviewId);
      if (!response.success) return;
      applyBreakdownDelta(review.rating, null);
      setReviews((current) =>
        current.filter((item) => String(item._id || item.id) !== String(reviewId)),
      );
      setBook((current) => ({
        ...current,
        rating: response.data.bookRating,
        reviewCount: response.data.bookReviewCount,
      }));
      setReviewPagination((current) => ({
        ...current,
        total: response.data.bookReviewCount,
        totalPages: Math.max(1, Math.ceil(response.data.bookReviewCount / 10)),
      }));
      setCanReview(true);
      setHasReviewed(false);
      toast.success("Đã xóa đánh giá");
    } catch (error) {
      toast.error(error.message || "Không thể xóa đánh giá");
    }
  };

  const handleReportReview = async (review, payload) => {
    try {
      const response = await booksAPI.reportReview(id, review._id || review.id, payload);
      toast.success(response.message || "Đã gửi báo cáo");
    } catch (error) {
      toast.error(error.message || "Không thể gửi báo cáo");
      throw error;
    }
  };

  const handleLoadMoreReviews = async () => {
    if (loadingMoreReviews || reviewPagination.page >= reviewPagination.totalPages) {
      return;
    }
    setLoadingMoreReviews(true);
    try {
      const response = await booksAPI.getReviews(id, {
        page: reviewPagination.page + 1,
        limit: 10,
        rating: reviewRating || undefined,
      });
      if (response.success) {
        setReviews((current) => {
          const byId = new Map(
            current.map((review) => [String(review._id || review.id), review]),
          );
          for (const review of response.data.reviews || []) {
            byId.set(String(review._id || review.id), review);
          }
          return [...byId.values()];
        });
        setReviewPagination(response.data.pagination);
      }
    } catch (error) {
      toast.error(error.message || "Không thể tải thêm đánh giá");
    } finally {
      setLoadingMoreReviews(false);
    }
  };

  const handleReviewRatingChange = async (rating) => {
    const nextRating = Number(rating) || 0;
    if (nextRating === reviewRating || loadingMoreReviews) return;
    setLoadingMoreReviews(true);
    try {
      const response = await booksAPI.getReviews(id, {
        page: 1,
        limit: 10,
        rating: nextRating || undefined,
      });
      if (response.success) {
        setReviewRating(nextRating);
        setReviews(response.data.reviews || []);
        setReviewPagination(response.data.pagination);
        setRatingBreakdown(response.data.ratingBreakdown || ratingBreakdown);
      }
    } catch (error) {
      toast.error(error.message || "Không thể lọc đánh giá");
    } finally {
      setLoadingMoreReviews(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: book?.title, url });
      } catch {
        // A cancelled share rejects — that is not an error worth reporting.
      }
      return;
    }
    // Was calling navigator.clipboard.writeText unguarded, which throws on
    // insecure origins, and reported success either way.
    const ok = await copy(url);
    if (ok) toast.success("Đã copy link sản phẩm");
    else toast.error("Không thể copy link");
  };

  if (loading || loadedBookId !== id) return <DetailSkeleton />;

  if (!book) {
    return (
      <EmptyState
        icon={BookOpen}
        title={loadError ? "Không thể tải thông tin sách" : "Không tìm thấy sách"}
        description={
          loadError || "Cuốn sách bạn tìm không tồn tại hoặc đã bị gỡ."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {loadError && (
              <Button onClick={() => setRetryVersion((value) => value + 1)}>
                Thử lại
              </Button>
            )}
            <Button asChild variant={loadError ? "outline" : "default"}>
              <Link to="/products">
                <ArrowLeft className="size-4" />
                Về danh sách sách
              </Link>
            </Button>
          </div>
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
      {/* Breadcrumb-only band — the title lives inside the product panel. */}
      <PageHeader
        crumbs={[
          { label: "Trang chủ", to: "/" },
          {
            label: category?.name || "Sách",
            to: `/products?category=${book.category}`,
          },
          { label: book.title, truncate: true },
        ]}
      />

      {/* Product section */}
      <section className="page-container py-6">
        <div className="bg-card rounded-2xl ring-1 ring-foreground/[0.06] shadow-rest overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10 p-5 lg:p-8">
            {/* Gallery */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <BookCover
                  src={images[activeImage] || book.imageUrl}
                  title={book.title}
                  size="full"
                  priority
                  className="mx-auto max-w-md ring-1 ring-foreground/[0.06] shadow-lift"
                >
                  <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
                    {discountPercent > 0 && (
                      <Badge variant="sale">-{discountPercent}%</Badge>
                    )}
                    {book.sold > 300 && (
                      <Badge variant="bestseller">Best seller</Badge>
                    )}
                  </div>
                </BookCover>

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
                            "h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-muted snap-start transition",
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
                    className={cn(wished && "text-danger-strong border-danger-strong/40")}
                  >
                    <Heart
                      className={cn("size-4", wished && "fill-current")}
                    />
                    {wished ? "Đã yêu thích" : "Yêu thích"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="size-4" />
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
                    className="text-xs font-semibold text-primary uppercase tracking-wider hover:underline"
                  >
                    {category.name}
                  </Link>
                )}
                <h1 className="text-h2 lg:text-h1 font-display font-bold text-foreground mt-1.5 leading-tight">
                  {book.title}
                </h1>
                <p className="mt-1.5 text-base text-muted-foreground">
                  Tác giả:{" "}
                  <span className="font-medium text-foreground">
                    {book.author}
                  </span>
                  {book.publisher && (
                    <>
                      <span className="mx-2 text-muted-foreground/60">•</span>
                      NXB:{" "}
                      <span className="font-medium text-foreground">
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Rating value={book.rating} size="md" />
                  <span className="font-semibold text-foreground">
                    {Number(book.rating || 0).toFixed(1)}
                  </span>
                  <a
                    href="#reviews"
                    className="text-sm text-primary hover:underline"
                  >
                    ({book.reviewCount || 0} đánh giá)
                  </a>
                </div>
                <span className="text-muted-foreground/60">|</span>
                <span className="text-sm text-muted-foreground">
                  Đã bán{" "}
                  <span className="font-semibold text-foreground">
                    {formatCompact(book.sold || 0)}
                  </span>
                </span>
                <span className="text-muted-foreground/60">|</span>
                <span
                  className={cn(
                    "text-sm font-medium flex items-center gap-1",
                    outOfStock
                      ? "text-danger-strong"
                      : lowStock
                        ? "text-warning-strong"
                        : "text-success-strong",
                  )}
                >
                  <CheckCircle2 className="size-4" />
                  {outOfStock ? "Hết hàng" : "Còn hàng"}
                </span>
              </div>

              {/* Price */}
              <div className="bg-gradient-to-br from-primary-50/60 to-brand-muted/40 rounded-2xl p-5 border border-primary-100/50">
                <PriceTag
                  price={price}
                  originalPrice={originalPrice}
                  size="2xl"
                  showSaved
                />
                {discountPercent > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Giá đã bao gồm VAT. Áp dụng đến hết hôm nay.
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-foreground">
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
                  <ShoppingCart className="size-5" />
                  Thêm vào giỏ
                </Button>
                <Button
                  size="lg"
                  onClick={handleBuyNow}
                  disabled={outOfStock}
                  className="flex-1"
                >
                  <Zap className="size-5" />
                  Mua ngay
                </Button>
              </div>

              {/* Trust */}
              <div className="pt-4 border-t border-border">
                <TrustBadgeRow variant="inline" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <BookDetailTabs
        book={book}
        canReview={canReview}
        hasReviewed={hasReviewed}
        descExpanded={descExpanded}
        loadingMoreReviews={loadingMoreReviews}
        onLoadMoreReviews={handleLoadMoreReviews}
        onEditReview={handleEditReview}
        onDeleteReview={handleDeleteReview}
        onReportReview={handleReportReview}
        onSubmitReview={handleSubmitReview}
        ratingBreakdown={ratingBreakdown}
        reviewRating={reviewRating}
        onReviewRatingChange={handleReviewRatingChange}
        reviewPagination={reviewPagination}
        reviews={reviews}
        setDescExpanded={setDescExpanded}
        specRows={specRows}
        submittingReview={submittingReview}
        user={user}
      />

      {/* Related books */}
      {relatedBooks.length > 0 && (
        <section className="page-container bg-card border-t border-border">
          <RecommendationRail
            title="Khách hàng cũng mua"
            subtitle="Những cuốn sách liên quan bạn có thể thích"
            books={relatedBooks}
          />
        </section>
      )}

      {/* Sticky mobile CTA */}
      <StickyMobileBar>
        <Button
          variant="outline"
          size="lg"
          onClick={handleAddToCart}
          disabled={outOfStock}
          className="flex-1"
        >
          <ShoppingCart className="size-4" />
          Giỏ hàng
        </Button>
        <Button
          size="lg"
          onClick={handleBuyNow}
          disabled={outOfStock}
          className="flex-1"
        >
          <Zap className="size-4" />
          Mua ngay
        </Button>
      </StickyMobileBar>
    </div>
  );
}
