import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, SlidersHorizontal, PackageSearch } from "lucide-react";
import { booksAPI } from "@/services/api";
import { useCategories } from "@/context/CategoryContext.jsx";
import BookCard from "@/components/book/BookCard";
import { BookGridSkeleton } from "@/components/book/BookCardSkeleton";
import FilterSidebar from "@/components/filter/FilterSidebar";
import SortSelect from "@/components/filter/SortSelect";
import ActiveFilterChips from "@/components/filter/ActiveFilterChips";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const PRICE_LABELS = {
  "0-50000": "< 50k",
  "50000-100000": "50k - 100k",
  "100000-200000": "100k - 200k",
  "200000+": "> 200k",
};
const PAGE_SIZE = 60;

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories } = useCategories();

  const [books, setBooks] = useState([]);
  const [totalBooks, setTotalBooks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const sortBy = searchParams.get("sort") || "bestseller";
  const category = searchParams.get("category") || "";
  const priceRange = searchParams.get("price") || "all";
  const search = searchParams.get("search") || "";
  const minRating = Number(searchParams.get("rating") || 0);
  const inStock = searchParams.get("stock") === "1";
  const tag = searchParams.get("tag") || "";

  const filterKey = useMemo(
    () => JSON.stringify({ category, inStock, minRating, priceRange, search, sortBy, tag }),
    [category, inStock, minRating, priceRange, search, sortBy, tag]
  );

  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const priceMap = {
          "0-50000": { maxPrice: 49999 },
          "50000-100000": { minPrice: 50000, maxPrice: 99999 },
          "100000-200000": { minPrice: 100000, maxPrice: 199999 },
          "200000+": { minPrice: 200000 },
        };
        const booksRes = await booksAPI.getAll({
          category,
          search,
          tag,
          sort: sortBy,
          rating: minRating || undefined,
          stock: inStock ? "1" : undefined,
          page,
          limit: PAGE_SIZE,
          ...(priceMap[priceRange] || {}),
        });
        const nextBooks = booksRes.data?.books || [];
        setBooks((prev) => (page === 1 ? nextBooks : [...prev, ...nextBooks]));
        setTotalBooks(booksRes.data?.pagination?.total || 0);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [category, filterKey, inStock, minRating, page, priceRange, search, sortBy, tag]);

  const filteredBooks = useMemo(() => {
    return books;
  }, [books]);

  const updateParam = (key, value) => {
    const p = new URLSearchParams(searchParams);
    if (value === "" || value == null || value === false || value === "0")
      p.delete(key);
    else p.set(key, value);
    setSearchParams(p);
  };

  const clearAll = () => setSearchParams({ sort: sortBy });

  const currentCategory = categories.find(
    (c) => (c.slug || c._id || c.id) === category
  );

  const chips = [];
  if (currentCategory)
    chips.push({
      key: "category",
      label: currentCategory.name,
      onRemove: () => updateParam("category", ""),
    });
  if (priceRange !== "all" && PRICE_LABELS[priceRange])
    chips.push({
      key: "price",
      label: `Giá: ${PRICE_LABELS[priceRange]}`,
      onRemove: () => updateParam("price", ""),
    });
  if (search)
    chips.push({
      key: "search",
      label: `"${search}"`,
      onRemove: () => updateParam("search", ""),
    });
  if (tag)
    chips.push({
      key: "tag",
      label: `#${tag}`,
      onRemove: () => updateParam("tag", ""),
    });
  if (minRating > 0)
    chips.push({
      key: "rating",
      label: `${minRating}★ trở lên`,
      onRemove: () => updateParam("rating", ""),
    });
  if (inStock)
    chips.push({
      key: "stock",
      label: "Còn hàng",
      onRemove: () => updateParam("stock", ""),
    });

  const filterProps = {
    categories,
    selectedCategory: category,
    onCategoryChange: (v) => updateParam("category", v),
    priceRange,
    onPriceRangeChange: (v) => updateParam("price", v === "all" ? "" : v),
    minRating,
    onMinRatingChange: (v) => updateParam("rating", v > 0 ? String(v) : ""),
    inStock,
    onInStockChange: (v) => updateParam("stock", v ? "1" : ""),
    hasActive: chips.length > 0,
    onClearFilters: clearAll,
  };

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumb className="mb-3">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Trang chủ</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {currentCategory ? currentCategory.name : "Tất cả sách"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-secondary-800">
            {currentCategory
              ? currentCategory.name
              : search
              ? `Kết quả cho "${search}"`
              : "Tất cả sách"}
          </h1>
          <p className="text-secondary-500 mt-1 text-sm">
            {loading ? "Đang tải..." : `${totalBooks || filteredBooks.length} sản phẩm`}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Desktop filter sidebar */}
          <div className="hidden lg:block">
            <FilterSidebar {...filterProps} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Top bar */}
            <div className="flex flex-wrap items-center gap-3 justify-between mb-4">
              <div className="flex items-center gap-2">
                {/* Mobile filter button */}
                <Sheet
                  open={mobileFiltersOpen}
                  onOpenChange={setMobileFiltersOpen}
                >
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden">
                      <SlidersHorizontal className="w-4 h-4" />
                      Bộ lọc
                      {chips.length > 0 && (
                        <span className="ml-1 w-5 h-5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {chips.length}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 p-0 overflow-y-auto">
                    <SheetHeader className="p-5 border-b border-gray-100">
                      <SheetTitle>Bộ lọc</SheetTitle>
                    </SheetHeader>
                    <div className="p-4">
                      <FilterSidebar
                        {...filterProps}
                        sticky={false}
                        className="lg:w-full"
                      />
                    </div>
                  </SheetContent>
                </Sheet>
                <ActiveFilterChips chips={chips} />
              </div>
              <SortSelect
                value={sortBy}
                onChange={(v) => updateParam("sort", v)}
              />
            </div>

            {loading && page === 1 ? (
              <BookGridSkeleton count={10} />
            ) : filteredBooks.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="Không tìm thấy sách phù hợp"
                description="Thử điều chỉnh bộ lọc hoặc tìm kiếm với từ khóa khác."
                action={
                  <Button onClick={clearAll}>
                    <BookOpen className="w-4 h-4" />
                    Xóa bộ lọc
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-5">
                  {filteredBooks.map((book) => (
                    <BookCard key={book._id || book.id} book={book} />
                  ))}
                </div>
                {filteredBooks.length < totalBooks && (
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={loading}
                    >
                      Tai them
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
