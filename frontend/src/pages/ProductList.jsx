import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, SlidersHorizontal } from "lucide-react";
import { booksAPI } from "@/services/api";
import { useCategories } from "@/context/CategoryContext.jsx";
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
import PageHeader from "@/components/common/PageHeader";
import BookGrid from "@/components/book/BookGrid";

import {
  ErrorIllustration,
  NoResultsIllustration,
} from "@/components/common/illustrations";
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
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const [loadedFilterKey, setLoadedFilterKey] = useState("");
  const [pageState, setPageState] = useState({ filterKey: "", page: 1 });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [facets, setFacets] = useState({
    authors: [],
    publishers: [],
    languages: [],
  });

  const search = searchParams.get("search") || "";
  const requestedSort = searchParams.get("sort") || "";
  const sortBy =
    !search && requestedSort === "relevance"
      ? "bestseller"
      : requestedSort || (search ? "relevance" : "bestseller");
  const category = searchParams.get("category") || "";
  const priceRange = searchParams.get("price") || "all";
  const minRating = Number(searchParams.get("rating") || 0);
  const inStock = searchParams.get("stock") === "1";
  const tag = searchParams.get("tag") || "";
  const author = searchParams.get("author") || "";
  const publisher = searchParams.get("publisher") || "";
  const language = searchParams.get("language") || "";

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        author,
        category,
        inStock,
        language,
        minRating,
        priceRange,
        publisher,
        search,
        sortBy,
        tag,
      }),
    [
      author,
      category,
      inStock,
      language,
      minRating,
      priceRange,
      publisher,
      search,
      sortBy,
      tag,
    ]
  );
  const page = pageState.filterKey === filterKey ? pageState.page : 1;

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      setError("");
      if (page === 1) {
        setBooks([]);
        setTotalBooks(0);
      }
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
          author,
          publisher,
          language,
          sort: sortBy,
          rating: minRating || undefined,
          stock: inStock ? "1" : undefined,
          page,
          limit: PAGE_SIZE,
          ...(priceMap[priceRange] || {}),
        });
        if (!active) return;
        const nextBooks = booksRes.data?.books || [];
        setBooks((prev) => {
          if (page === 1) return nextBooks;
          const byId = new Map(
            prev.map((book) => [String(book._id || book.id), book])
          );
          for (const book of nextBooks) {
            byId.set(String(book._id || book.id), book);
          }
          return [...byId.values()];
        });
        setTotalBooks(booksRes.data?.pagination?.total || 0);
        setLoadedFilterKey(filterKey);
      } catch (error) {
        if (!active) return;
        setError(error.message || "Không thể tải danh sách sách");
        if (page === 1) setLoadedFilterKey(filterKey);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [
    author,
    category,
    filterKey,
    inStock,
    language,
    minRating,
    page,
    priceRange,
    publisher,
    retryVersion,
    search,
    sortBy,
    tag,
  ]);

  // Facet values change only when the catalogue does, so they are fetched once
  // rather than on every filter change.
  useEffect(() => {
    let active = true;
    // Guarded so a build without the facets endpoint (or a narrower API mock)
    // degrades to the base filters instead of breaking the page.
    if (typeof booksAPI.getFacets !== "function") return undefined;
    Promise.resolve(booksAPI.getFacets())
      .then((response) => {
        if (!active || !response?.success) return;
        setFacets({
          authors: response.data?.authors || [],
          publishers: response.data?.publishers || [],
          languages: response.data?.languages || [],
        });
      })
      .catch(() => {
        // A missing facet list only costs the extra filters, so the page still
        // works without them.
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredBooks = useMemo(() => {
    return loadedFilterKey === filterKey ? books : [];
  }, [books, filterKey, loadedFilterKey]);

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
  if (author)
    chips.push({
      key: "author",
      label:
        facets.authors.find((option) => option.value === author)?.label || author,
      onRemove: () => updateParam("author", ""),
    });
  if (publisher)
    chips.push({
      key: "publisher",
      label:
        facets.publishers.find((option) => option.value === publisher)?.label ||
        publisher,
      onRemove: () => updateParam("publisher", ""),
    });
  if (language)
    chips.push({
      key: "language",
      label: language,
      onRemove: () => updateParam("language", ""),
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
    authors: facets.authors,
    selectedAuthor: author,
    onAuthorChange: (v) => updateParam("author", v),
    publishers: facets.publishers,
    selectedPublisher: publisher,
    onPublisherChange: (v) => updateParam("publisher", v),
    languages: facets.languages,
    selectedLanguage: language,
    onLanguageChange: (v) => updateParam("language", v),
    hasActive: chips.length > 0,
    onClearFilters: clearAll,
  };

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <PageHeader
        crumbs={[
          { label: "Trang chủ", to: "/" },
          { label: currentCategory ? currentCategory.name : "Tất cả sách" },
        ]}
        title={
          currentCategory
            ? currentCategory.name
            : search
              ? `Kết quả cho "${search}"`
              : "Tất cả sách"
        }
        subtitle={
          loading
            ? "Đang tải..."
            : `${totalBooks || filteredBooks.length} sản phẩm`
        }
      />

      <div className="page-container py-6">
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
                      <SlidersHorizontal className="size-4" />
                      Bộ lọc
                      {chips.length > 0 && (
                        <span className="ml-1 size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {chips.length}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 p-0 overflow-y-auto">
                    <SheetHeader className="p-5 border-b border-border">
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
                showRelevance={Boolean(search)}
                onChange={(v) => updateParam("sort", v)}
              />
            </div>

            {loading && page === 1 ? (
              <BookGridSkeleton count={10} variant="with-sidebar" />
            ) : error && filteredBooks.length === 0 ? (
              <EmptyState
                illustration={ErrorIllustration}
                title="Không thể tải danh sách sách"
                description={error}
                action={
                  <Button onClick={() => setRetryVersion((value) => value + 1)}>
                    Thử lại
                  </Button>
                }
              />
            ) : filteredBooks.length === 0 ? (
              <EmptyState
                illustration={NoResultsIllustration}
                title="Không tìm thấy sách phù hợp"
                description="Thử điều chỉnh bộ lọc hoặc tìm kiếm với từ khóa khác."
                action={
                  <Button onClick={clearAll}>
                    <BookOpen className="size-4" />
                    Xóa bộ lọc
                  </Button>
                }
              />
            ) : (
              <>
                <BookGrid books={filteredBooks} variant="with-sidebar" />
                {filteredBooks.length < totalBooks && (
                  <div className="mt-6 flex justify-center">
                    <div className="flex flex-col items-center gap-2">
                      {error && <p className="text-sm text-danger-strong">{error}</p>}
                      <Button
                        variant="outline"
                        onClick={() =>
                          error
                            ? setRetryVersion((value) => value + 1)
                            : setPageState({ filterKey, page: page + 1 })
                        }
                        disabled={loading}
                      >
                        {error ? "Thử lại" : "Tải thêm"}
                      </Button>
                    </div>
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
