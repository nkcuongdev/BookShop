import { useMemo, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import Rating from "@/components/common/Rating";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRICE_RANGES = [
  { value: "all", label: "Tất cả giá" },
  { value: "0-50000", label: "Dưới 50.000đ" },
  { value: "50000-100000", label: "50.000đ - 100.000đ" },
  { value: "100000-200000", label: "100.000đ - 200.000đ" },
  { value: "200000+", label: "Trên 200.000đ" },
];

const RATINGS = [5, 4, 3];

// Author and publisher lists can run to a hundred entries, so each long facet
// gets its own filter box. The currently selected value is always kept in the
// list, otherwise clearing it would be impossible once it is typed away.
const FACET_SEARCH_THRESHOLD = 8;

function FacetSection({ title, idPrefix, options, selected, onChange }) {
  const [term, setTerm] = useState("");
  const showSearch = options.length > FACET_SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.value === selected ||
        String(option.label || option.value).toLowerCase().includes(needle)
    );
  }, [options, selected, term]);

  if (options.length === 0) return null;

  return (
    <AccordionItem value={idPrefix}>
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent>
        {showSearch && (
          <div className="relative mb-2.5">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={`Tìm ${title.toLowerCase()}`}
              aria-label={`Tìm ${title.toLowerCase()}`}
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
        <RadioGroup
          value={selected || "__all__"}
          onValueChange={(value) => onChange?.(value === "__all__" ? "" : value)}
          className="gap-2.5 max-h-56 overflow-y-auto pr-1"
        >
          <div className="flex items-center gap-2.5">
            <RadioGroupItem value="__all__" id={`${idPrefix}-all`} />
            <Label htmlFor={`${idPrefix}-all`} className="cursor-pointer">
              Tất cả
            </Label>
          </div>
          {visible.map((option) => (
            <div key={option.value} className="flex items-center gap-2.5">
              <RadioGroupItem
                value={option.value}
                id={`${idPrefix}-${option.value}`}
              />
              <Label
                htmlFor={`${idPrefix}-${option.value}`}
                className="cursor-pointer line-clamp-1 flex-1"
              >
                {option.label || option.value}
              </Label>
              {option.count > 0 && (
                <span className="text-[11px] text-muted-foreground/70 shrink-0">
                  {option.count}
                </span>
              )}
            </div>
          ))}
          {visible.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">
              Không tìm thấy kết quả
            </p>
          )}
        </RadioGroup>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function FilterSidebar({
  categories = [],
  selectedCategory = "",
  onCategoryChange,
  priceRange = "all",
  onPriceRangeChange,
  minRating = 0,
  onMinRatingChange,
  inStock = false,
  onInStockChange,
  authors = [],
  selectedAuthor = "",
  onAuthorChange,
  publishers = [],
  selectedPublisher = "",
  onPublisherChange,
  languages = [],
  selectedLanguage = "",
  onLanguageChange,
  onClearFilters,
  hasActive = false,
  sticky = true,
  className,
}) {
  return (
    <aside className={cn("w-full lg:w-64 shrink-0", className)}>
      <div
        className={cn(
          "bg-card rounded-2xl ring-1 ring-foreground/[0.06] shadow-rest p-5",
          // A stuck panel with no height cap can exceed the viewport, leaving
          // the lower filters unreachable. 6rem clears the sticky header plus
          // breathing room at the bottom.
          sticky &&
            "lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-semibold text-foreground text-base flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Bộ lọc
          </h3>
          {hasActive && (
            <Button
              variant="link"
              size="sm"
              onClick={onClearFilters}
              className="h-auto p-0 text-xs"
            >
              <X className="size-3" />
              Xóa hết
            </Button>
          )}
        </div>

        <Accordion
          type="multiple"
          defaultValue={["category", "price", "rating", "stock"]}
          className="space-y-0"
        >
          {categories.length > 0 && (
            <AccordionItem value="category">
              <AccordionTrigger>Danh mục</AccordionTrigger>
              <AccordionContent>
                <RadioGroup
                  value={selectedCategory || "__all__"}
                  onValueChange={(v) =>
                    onCategoryChange?.(v === "__all__" ? "" : v)
                  }
                  className="gap-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <RadioGroupItem value="__all__" id="cat-all" />
                    <Label htmlFor="cat-all" className="cursor-pointer">
                      Tất cả
                    </Label>
                  </div>
                  {categories.map((cat) => {
                    const key = cat.slug || cat._id || cat.id;
                    return (
                      <div key={key} className="flex items-center gap-2.5">
                        <RadioGroupItem value={key} id={`cat-${key}`} />
                        <Label
                          htmlFor={`cat-${key}`}
                          className="cursor-pointer line-clamp-1"
                        >
                          {cat.name}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="price">
            <AccordionTrigger>Khoảng giá</AccordionTrigger>
            <AccordionContent>
              <RadioGroup
                value={priceRange || "all"}
                onValueChange={onPriceRangeChange}
                className="gap-2.5"
              >
                {PRICE_RANGES.map((r) => (
                  <div key={r.value} className="flex items-center gap-2.5">
                    <RadioGroupItem value={r.value} id={`price-${r.value}`} />
                    <Label
                      htmlFor={`price-${r.value}`}
                      className="cursor-pointer"
                    >
                      {r.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="rating">
            <AccordionTrigger>Đánh giá</AccordionTrigger>
            <AccordionContent>
              <RadioGroup
                value={String(minRating || 0)}
                onValueChange={(v) => onMinRatingChange?.(Number(v))}
                className="gap-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="0" id="rating-all" />
                  <Label htmlFor="rating-all" className="cursor-pointer">
                    Tất cả
                  </Label>
                </div>
                {RATINGS.map((r) => (
                  <div key={r} className="flex items-center gap-2.5">
                    <RadioGroupItem value={String(r)} id={`rating-${r}`} />
                    <Label
                      htmlFor={`rating-${r}`}
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Rating value={r} size="sm" />
                      <span className="text-xs text-muted-foreground">trở lên</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </AccordionContent>
          </AccordionItem>

          <FacetSection
            title="Tác giả"
            idPrefix="author"
            options={authors}
            selected={selectedAuthor}
            onChange={onAuthorChange}
          />

          <FacetSection
            title="Nhà xuất bản"
            idPrefix="publisher"
            options={publishers}
            selected={selectedPublisher}
            onChange={onPublisherChange}
          />

          <FacetSection
            title="Ngôn ngữ"
            idPrefix="language"
            options={languages}
            selected={selectedLanguage}
            onChange={onLanguageChange}
          />

          <AccordionItem value="stock" className="border-b-0">
            <AccordionTrigger>Tình trạng</AccordionTrigger>
            <AccordionContent>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="in-stock"
                  checked={inStock}
                  onCheckedChange={onInStockChange}
                />
                <Label htmlFor="in-stock" className="cursor-pointer">
                  Chỉ còn hàng
                </Label>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </aside>
  );
}
