import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { booksAPI, categoriesAPI } from "../services/api.js";
import BookCard from "../components/BookCard.jsx";

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [booksByCategory, setBooksByCategory] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch categories and all books
        const [categoriesRes, booksRes] = await Promise.all([
          categoriesAPI.getAll(),
          booksAPI.getAll(),
        ]);

        const cats = categoriesRes.data?.categories || [];
        const allBooks = booksRes.data?.books || [];
        setCategories(cats);

        // Group books by category and get top 5 featured books per category
        const grouped = {};
        cats.forEach((cat) => {
          const categorySlug = cat.slug || cat._id || cat.id;
          const categoryBooks = allBooks
            .filter((book) => book.category === categorySlug)
            .sort((a, b) => (b.sold || 0) - (a.sold || 0)) // Sort by sold count
            .slice(0, 5); // Take top 5
          grouped[categorySlug] = categoryBooks;
        });
        setBooksByCategory(grouped);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-secondary-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  // Check if there are any books
  const hasBooks = Object.values(booksByCategory).some(
    (books) => books.length > 0
  );

  return (
    <div className="bg-gray-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-900">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl"></div>
        </div>

        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        ></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-primary-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse"></span>
                Chào mừng đến với BookShop
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white leading-tight">
                Khám phá
                <span className="block bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
                  Thế giới sách
                </span>
              </h1>

              <p className="mt-6 text-lg text-secondary-300 max-w-lg mx-auto lg:mx-0">
                Khám phá bộ sưu tập sách đa dạng với nhiều thể loại phong phú.
                Tìm cuốn sách hoàn hảo cho mọi tâm trạng.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link
                  to="/products"
                  className="inline-flex items-center justify-center gap-2 bg-primary-500 text-white px-8 py-4 rounded-xl font-semibold hover:bg-primary-600 transition-all duration-200 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5 cursor-pointer"
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
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  Khám phá ngay
                </Link>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="relative">
                {/* Left book */}
                <div className="absolute -left-8 top-20 w-48 h-64 rounded-2xl transform -rotate-12 shadow-2xl overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400"
                    alt="Book"
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Right book */}
                <div className="absolute -right-4 bottom-12 w-48 h-64 rounded-2xl transform rotate-6 shadow-2xl overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400"
                    alt="Book"
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Center book */}
                <div className="relative z-10 w-72 h-96 mx-auto">
                  <img
                    src="https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600"
                    alt="Featured Book"
                    className="w-full h-full object-cover rounded-2xl shadow-2xl"
                  />
                  <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Empty State */}
      {!hasBooks && categories.length === 0 && (
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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
            <h2 className="text-2xl font-bold text-secondary-800 mb-2">
              Chưa có sách nào
            </h2>
            <p className="text-secondary-500 mb-6 max-w-md mx-auto">
              Vui lòng thêm danh mục và sách qua trang quản trị Admin để bắt
              đầu.
            </p>
            <Link
              to="/admin/categories"
              className="inline-flex items-center gap-2 bg-primary-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-600 transition-all"
            >
              Thêm danh mục
            </Link>
          </div>
        </section>
      )}

      {/* Books by Category - Each category is a horizontal row */}
      {categories.map((category, idx) => {
        const categorySlug = category.slug || category._id || category.id;
        const books = booksByCategory[categorySlug] || [];

        if (books.length === 0) return null;

        return (
          <section
            key={categorySlug}
            className={`py-12 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Category Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-8 bg-primary-500 rounded-full"></div>
                  <h2 className="text-2xl font-display font-bold text-secondary-800">
                    {category.name}
                  </h2>
                  <span className="text-secondary-400 text-sm">
                    ({books.length} sách)
                  </span>
                </div>
                <Link
                  to={`/products?category=${categorySlug}`}
                  className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1 group"
                >
                  Xem tất cả
                  <svg
                    className="w-4 h-4 transform group-hover:translate-x-1 transition-transform"
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
              </div>

              {/* Horizontal Book Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6">
                {books.map((book, bookIdx) => (
                  <BookCard
                    key={book._id || book.id}
                    book={book}
                    badge={bookIdx === 0 ? "bestseller" : undefined}
                    rank={bookIdx === 0 ? 1 : undefined}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* Categories Overview Grid - only show if there are categories */}
      {categories.length > 0 && (
        <section className="bg-white py-12 lg:py-16 border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-2xl lg:text-3xl font-display font-bold text-secondary-800">
                Tất cả danh mục
              </h2>
              <p className="text-secondary-500 mt-2">
                Tìm sách theo thể loại yêu thích
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {categories.map((cat) => {
                const catSlug = cat.slug || cat._id || cat.id;
                const catBooks = booksByCategory[catSlug] || [];
                return (
                  <Link
                    key={catSlug}
                    to={`/products?category=${catSlug}`}
                    className="group relative overflow-hidden rounded-2xl aspect-[4/5] cursor-pointer"
                  >
                    <img
                      src={
                        cat.image ||
                        "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400"
                      }
                      alt={cat.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    <div className="absolute inset-0 bg-primary-600/0 group-hover:bg-primary-600/20 transition-colors duration-300"></div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-semibold text-sm lg:text-base">
                        {cat.name}
                      </h3>
                      <p className="text-white/70 text-xs mt-1">
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
    </div>
  );
}
