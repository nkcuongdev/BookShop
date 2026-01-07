import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { booksAPI } from "../services/api.js";
import { useCategories } from "../context/CategoryContext.jsx";
import BookCard from "../components/BookCard.jsx";
import FilterSidebar from "../components/FilterSidebar.jsx";
import SortDropdown from "../components/SortDropdown.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories } = useCategories();

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Get filter values from URL
  const sortBy = searchParams.get("sort") || "bestseller";
  const category = searchParams.get("category") || "";
  const priceRange = searchParams.get("price") || "all";
  const search = searchParams.get("search") || "";

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const booksRes = await booksAPI.getAll();
        setBooks(booksRes.data?.books || []);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Filter and sort books
  const filteredBooks = useMemo(() => {
    let result = [...books];

    // Filter by category
    if (category) {
      result = result.filter((book) => book.category === category);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (book) =>
          book.title.toLowerCase().includes(searchLower) ||
          book.author.toLowerCase().includes(searchLower)
      );
    }

    // Filter by price range (VNĐ)
    if (priceRange && priceRange !== "all") {
      if (priceRange === "0-50000") {
        result = result.filter((book) => book.price < 50000);
      } else if (priceRange === "50000-100000") {
        result = result.filter(
          (book) => book.price >= 50000 && book.price < 100000
        );
      } else if (priceRange === "100000-200000") {
        result = result.filter(
          (book) => book.price >= 100000 && book.price < 200000
        );
      } else if (priceRange === "200000+") {
        result = result.filter((book) => book.price >= 200000);
      }
    }

    // Sort
    if (sortBy === "bestseller") {
      result.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    } else if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortBy === "price-asc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === "rating") {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return result;
  }, [books, category, search, priceRange, sortBy]);

  // Update URL params
  const updateFilter = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchParams({ sort: "bestseller" });
  };

  // Active filters for display
  const activeFilters = [];
  if (category) {
    const cat = categories.find((c) => (c.slug || c._id || c.id) === category);
    if (cat) activeFilters.push({ key: "category", label: cat.name });
  }
  if (priceRange && priceRange !== "all") {
    activeFilters.push({ key: "price", label: priceRange });
  }
  if (search) {
    activeFilters.push({ key: "search", label: `"${search}"` });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-secondary-500">Đang tải sản phẩm...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2 text-sm text-secondary-500 mb-4">
            <Link to="/" className="hover:text-primary-600 transition-colors">
              Trang chủ
            </Link>
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
            <span className="text-secondary-800 font-medium">Tất cả sách</span>
          </div>
          <h1 className="text-3xl font-display font-bold text-secondary-800">
            {category
              ? categories.find((c) => (c.slug || c._id || c.id) === category)
                  ?.name || "Sách"
              : "Tất cả sách"}
          </h1>
          <p className="text-secondary-500 mt-1">
            {filteredBooks.length} sản phẩm
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Mobile filter button */}
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors cursor-pointer"
            >
              <svg
                className="w-5 h-5 text-secondary-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <span className="font-medium text-secondary-700">Bộ lọc</span>
            </button>

            {/* Active filter tags */}
            {activeFilters.map((filter) => (
              <span
                key={filter.key}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm font-medium"
              >
                {filter.label}
                <button
                  onClick={() => updateFilter(filter.key, "")}
                  className="ml-1 hover:bg-primary-100 rounded-full p-0.5 cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </span>
            ))}

            {activeFilters.length > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm text-secondary-500 hover:text-primary-600 transition-colors cursor-pointer"
              >
                Xóa tất cả
              </button>
            )}
          </div>

          <SortDropdown
            value={sortBy}
            onChange={(value) => updateFilter("sort", value)}
          />
        </div>

        <div className="flex gap-8">
          {/* Sidebar - Desktop */}
          <div className="hidden lg:block">
            <FilterSidebar
              categories={categories}
              selectedCategory={category}
              onCategoryChange={(value) => updateFilter("category", value)}
              priceRange={priceRange}
              onPriceRangeChange={(value) => updateFilter("price", value)}
              onClearFilters={clearFilters}
            />
          </div>

          {/* Mobile Sidebar */}
          {mobileFiltersOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="fixed inset-0 bg-black/50"
                onClick={() => setMobileFiltersOpen(false)}
              />
              <div className="fixed inset-y-0 left-0 w-80 bg-white shadow-xl overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b">
                  <h2 className="text-lg font-semibold text-secondary-800">
                    Bộ lọc
                  </h2>
                  <button
                    onClick={() => setMobileFiltersOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="p-4">
                  <FilterSidebar
                    categories={categories}
                    selectedCategory={category}
                    onCategoryChange={(value) => {
                      updateFilter("category", value);
                      setMobileFiltersOpen(false);
                    }}
                    priceRange={priceRange}
                    onPriceRangeChange={(value) => {
                      updateFilter("price", value);
                      setMobileFiltersOpen(false);
                    }}
                    onClearFilters={() => {
                      clearFilters();
                      setMobileFiltersOpen(false);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1">
            {filteredBooks.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
                {filteredBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    badge={
                      sortBy === "bestseller" && book.sold > 100
                        ? "bestseller"
                        : sortBy === "newest"
                        ? "new"
                        : null
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
