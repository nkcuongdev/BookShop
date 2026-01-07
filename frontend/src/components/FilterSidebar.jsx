export default function FilterSidebar({
  categories,
  selectedCategory,
  onCategoryChange,
  priceRange,
  onPriceRangeChange,
  onClearFilters,
}) {
  // VNĐ price ranges (in thousands)
  const priceRanges = [
    { value: "all", label: "Tất cả giá" },
    { value: "0-50000", label: "Dưới 50.000đ" },
    { value: "50000-100000", label: "50.000đ - 100.000đ" },
    { value: "100000-200000", label: "100.000đ - 200.000đ" },
    { value: "200000+", label: "Trên 200.000đ" },
  ];

  const hasActiveFilters =
    selectedCategory || (priceRange && priceRange !== "all");

  return (
    <aside className="w-full lg:w-64 flex-shrink-0">
      <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-24">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-secondary-800 text-lg">Bộ lọc</h3>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium cursor-pointer"
            >
              Xóa tất cả
            </button>
          )}
        </div>

        {/* Category Filter */}
        <div className="mb-6">
          <h4 className="font-medium text-secondary-700 mb-3">Danh mục</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="category"
                checked={!selectedCategory}
                onChange={() => onCategoryChange("")}
                className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 cursor-pointer"
              />
              <span
                className={`text-sm group-hover:text-primary-600 transition-colors ${
                  !selectedCategory
                    ? "text-primary-600 font-medium"
                    : "text-secondary-600"
                }`}
              >
                Tất cả
              </span>
            </label>
            {categories.map((cat) => {
              const catKey = cat.slug || cat._id || cat.id;
              return (
                <label
                  key={catKey}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="radio"
                    name="category"
                    checked={selectedCategory === catKey}
                    onChange={() => onCategoryChange(catKey)}
                    className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 cursor-pointer"
                  />
                  <span
                    className={`text-sm group-hover:text-primary-600 transition-colors ${
                      selectedCategory === catKey
                        ? "text-primary-600 font-medium"
                        : "text-secondary-600"
                    }`}
                  >
                    {cat.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Price Range Filter */}
        <div>
          <h4 className="font-medium text-secondary-700 mb-3">Khoảng giá</h4>
          <div className="space-y-2">
            {priceRanges.map((range) => (
              <label
                key={range.value}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <input
                  type="radio"
                  name="priceRange"
                  checked={
                    priceRange === range.value ||
                    (!priceRange && range.value === "all")
                  }
                  onChange={() => onPriceRangeChange(range.value)}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 cursor-pointer"
                />
                <span
                  className={`text-sm group-hover:text-primary-600 transition-colors ${
                    priceRange === range.value ||
                    (!priceRange && range.value === "all")
                      ? "text-primary-600 font-medium"
                      : "text-secondary-600"
                  }`}
                >
                  {range.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
