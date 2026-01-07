import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { booksAPI, categoriesAPI } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useCart } from "../context/CartContext.jsx";
import { formatVND } from "../utils/format.js";
import BookCard from "../components/BookCard.jsx";

// Star Rating Component
function StarRating({
  rating,
  size = "md",
  interactive = false,
  onRate = null,
}) {
  const [hoverRating, setHoverRating] = useState(0);
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onRate?.(star)}
          onMouseEnter={() => interactive && setHoverRating(star)}
          onMouseLeave={() => interactive && setHoverRating(0)}
          className={`${
            interactive
              ? "cursor-pointer hover:scale-110 transition-transform"
              : "cursor-default"
          }`}
        >
          <svg
            className={`${sizeClasses[size]} ${
              star <= (hoverRating || rating)
                ? "text-amber-400"
                : "text-gray-200"
            } transition-colors duration-150`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function BookDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addItem } = useCart();

  const [book, setBook] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [relatedBooks, setRelatedBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);

  const [quantity, setQuantity] = useState(1);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [addedToCart, setAddedToCart] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Load book data
  useEffect(() => {
    const loadBook = async () => {
      setLoading(true);
      try {
        const [bookRes, categoriesRes] = await Promise.all([
          booksAPI.getById(id),
          categoriesAPI.getAll(),
        ]);

        if (bookRes.success) {
          setBook(bookRes.data.book);
          setReviews(bookRes.data.reviews || []);

          // Load related books (same category)
          const relatedRes = await booksAPI.getAll({
            category: bookRes.data.book.category,
            limit: 5,
          });
          if (relatedRes.success) {
            setRelatedBooks(
              relatedRes.data.books.filter((b) => b.id !== id).slice(0, 4)
            );
          }
        }

        if (categoriesRes.success) {
          setCategories(categoriesRes.data.categories);
        }

        // Check if user can review
        if (user) {
          try {
            const canReviewRes = await booksAPI.canReview(id);
            if (canReviewRes.success) {
              setCanReview(canReviewRes.data.canReview);
            }
          } catch (e) {
            // User can't review
          }
        }
      } catch (error) {
        console.error("Error loading book:", error);
      } finally {
        setLoading(false);
      }
    };
    loadBook();
  }, [id, user]);

  const category = categories.find((c) => c.id === book?.category);

  const handleAddToCart = () => {
    addItem(book, quantity);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!user || !canReview || !reviewComment.trim()) return;

    setSubmittingReview(true);
    setReviewError("");

    try {
      const response = await booksAPI.createReview(
        id,
        reviewRating,
        reviewComment.trim()
      );
      if (response.success) {
        setReviewSubmitted(true);
        setReviewComment("");
        // Add the new review to the list
        setReviews((prev) => [response.data.review, ...prev]);
        // Update book rating
        setBook((prev) => ({
          ...prev,
          rating: response.data.bookRating,
          reviewCount: response.data.bookReviewCount,
        }));
        setCanReview(false);
      }
    } catch (error) {
      setReviewError(error.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-secondary-500">Đang tải sách...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-secondary-800 mb-2">
          Không tìm thấy sách
        </h1>
        <p className="text-secondary-500 mb-6">
          Cuốn sách bạn tìm không tồn tại.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Quay lại Trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm">
            <Link
              to="/"
              className="text-secondary-500 hover:text-primary-600 transition-colors"
            >
              Trang chủ
            </Link>
            <svg
              className="w-4 h-4 text-secondary-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <Link
              to={`/?category=${book.category}`}
              className="text-secondary-500 hover:text-primary-600 transition-colors"
            >
              {category?.name}
            </Link>
            <svg
              className="w-4 h-4 text-secondary-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span className="text-secondary-800 font-medium truncate max-w-[200px]">
              {book.title}
            </span>
          </nav>
        </div>
      </div>

      {/* Product Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 p-6 lg:p-10">
            {/* Image */}
            <div className="relative">
              <div className="sticky top-24">
                <div className="relative aspect-[3/4] max-w-md mx-auto">
                  <img
                    src={book.imageUrl}
                    alt={book.title}
                    className="w-full h-full object-cover rounded-2xl shadow-xl"
                  />
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/5"></div>

                  {/* Badges */}
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    {book.sold > 300 && (
                      <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-lg">
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" />
                        </svg>
                        Best Seller
                      </span>
                    )}
                    {book.stock < 10 && book.stock > 0 && (
                      <span className="inline-flex items-center gap-1.5 bg-red-500 text-white text-sm font-medium px-3 py-1.5 rounded-full">
                        Only {book.stock} left!
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-col">
              {/* Category */}
              <Link
                to={`/?category=${book.category}`}
                className="inline-flex items-center gap-1 text-primary-600 text-sm font-medium hover:text-primary-700 transition-colors w-fit"
              >
                {category?.name}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>

              {/* Title */}
              <h1 className="text-3xl lg:text-4xl font-display font-bold text-secondary-800 mt-2">
                {book.title}
              </h1>

              {/* Author */}
              <p className="text-lg text-secondary-600 mt-2">
                Tác giả: <span className="font-medium">{book.author}</span>
              </p>

              {/* Rating */}
              <div className="flex items-center gap-3 mt-4">
                <StarRating rating={book.rating} size="md" />
                <span className="text-secondary-800 font-semibold">
                  {book.rating}
                </span>
                <span className="text-secondary-400">•</span>
                <span className="text-secondary-600">
                  {book.reviewCount} đánh giá
                </span>
                <span className="text-secondary-400">•</span>
                <span className="text-secondary-600">Đã bán {book.sold}</span>
              </div>

              {/* Price */}
              <div className="mt-6 p-4 bg-primary-50 rounded-xl">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-primary-600">
                    {formatVND(book.price)}
                  </span>
                </div>
                <p className="text-secondary-600 text-sm mt-1">
                  Miễn phí vận chuyển cho đơn hàng trên 500.000đ
                </p>
              </div>

              {/* Description */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-secondary-800 uppercase tracking-wider mb-2">
                  Mô tả
                </h3>
                <p className="text-secondary-600 leading-relaxed">
                  {book.description}
                </p>
              </div>

              {/* Stock & Info */}
              <div className="mt-6 flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <svg
                    className="w-5 h-5 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-secondary-600">
                    {book.stock > 0 ? "Còn hàng" : "Hết hàng"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <svg
                    className="w-5 h-5 text-blue-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                  </svg>
                  <span className="text-secondary-600">Giao hàng nhanh</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <svg
                    className="w-5 h-5 text-purple-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-secondary-600">
                    Thanh toán khi nhận hàng
                  </span>
                </div>
              </div>

              {/* Add to Cart */}
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <div className="flex items-center bg-gray-100 rounded-xl">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="px-4 py-3 text-secondary-600 hover:text-secondary-800 hover:bg-gray-200 rounded-l-xl transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 12H4"
                      />
                    </svg>
                  </button>
                  <span className="px-6 py-3 font-semibold text-secondary-800 min-w-[60px] text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() =>
                      setQuantity((q) => Math.min(book.stock, q + 1))
                    }
                    className="px-4 py-3 text-secondary-600 hover:text-secondary-800 hover:bg-gray-200 rounded-r-xl transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={handleAddToCart}
                  disabled={book.stock === 0}
                  className={`flex-1 py-3.5 px-8 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                    addedToCart
                      ? "bg-green-500"
                      : book.stock === 0
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-primary-500 hover:bg-primary-600 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30"
                  }`}
                >
                  {addedToCart ? (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Đã thêm vào giỏ!
                    </>
                  ) : book.stock === 0 ? (
                    "Hết hàng"
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      Thêm vào giỏ
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="bg-white rounded-2xl shadow-sm p-6 lg:p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-display font-bold text-secondary-800">
                Đánh giá của khách hàng
              </h2>
              <p className="text-secondary-500 mt-1">
                {reviews.length} đánh giá
              </p>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl">
              <span className="text-3xl font-bold text-secondary-800">
                {book.rating}
              </span>
              <div>
                <StarRating rating={book.rating} size="sm" />
                <p className="text-secondary-500 text-xs mt-0.5">trên 5</p>
              </div>
            </div>
          </div>

          {/* Review Form */}
          {user && canReview && !reviewSubmitted && (
            <form
              onSubmit={handleSubmitReview}
              className="bg-gray-50 rounded-xl p-6 mb-8"
            >
              <h3 className="font-semibold text-secondary-800 mb-4">
                Viết đánh giá
              </h3>

              {reviewError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
                  {reviewError}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  Đánh giá của bạn
                </label>
                <StarRating
                  rating={reviewRating}
                  size="lg"
                  interactive
                  onRate={setReviewRating}
                />
              </div>

              <div className="mb-4">
                <label
                  htmlFor="review-comment"
                  className="block text-sm font-medium text-secondary-700 mb-2"
                >
                  Nhận xét của bạn
                </label>
                <textarea
                  id="review-comment"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={4}
                  required
                  placeholder="Chia sẻ suy nghĩ của bạn về cuốn sách này..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={!reviewComment.trim() || submittingReview}
                className="bg-primary-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-primary-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submittingReview ? "Đang gửi..." : "Gửi đánh giá"}
              </button>
            </form>
          )}

          {reviewSubmitted && (
            <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl mb-8 flex items-center gap-3">
              <svg
                className="w-5 h-5 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Cảm ơn bạn đã đánh giá!
            </div>
          )}

          {!user && (
            <div className="bg-gray-50 p-6 rounded-xl mb-8 flex items-center gap-4">
              <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-secondary-800 font-medium">
                  Bạn muốn đánh giá?
                </p>
                <p className="text-secondary-500 text-sm">
                  <Link
                    to="/login"
                    className="text-primary-600 hover:underline"
                  >
                    Đăng nhập
                  </Link>{" "}
                  để chia sẻ ý kiến (chỉ người đã mua mới có thể đánh giá).
                </p>
              </div>
            </div>
          )}

          {user && !canReview && !reviewSubmitted && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-8 flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-500 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-amber-800 text-sm">
                Bạn chỉ có thể đánh giá sách đã mua và nhận hàng.
              </p>
            </div>
          )}

          {/* Reviews List */}
          {reviews.length > 0 ? (
            <div className="space-y-6">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="border-b border-gray-100 pb-6 last:border-0 last:pb-0"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                      {review.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium text-secondary-800">
                          {review.userName}
                        </span>
                        <span className="text-secondary-400 text-sm">
                          {review.createdAt?.split("T")[0] || review.createdAt}
                        </span>
                      </div>
                      <StarRating rating={review.rating} size="sm" />
                      <p className="text-secondary-600 mt-2 leading-relaxed">
                        {review.comment}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="text-secondary-500">
                Chưa có đánh giá nào. Hãy là người đầu tiên đánh giá sách này!
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Related Books */}
      {relatedBooks.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-display font-bold text-secondary-800">
                Có thể bạn cũng thích
              </h2>
              <p className="text-secondary-500 mt-1">
                Sách khác trong {category?.name}
              </p>
            </div>
            <Link
              to={`/?category=${book.category}`}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium transition-colors group"
            >
              Xem tất cả
              <svg
                className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {relatedBooks.map((relatedBook) => (
              <BookCard key={relatedBook.id} book={relatedBook} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
