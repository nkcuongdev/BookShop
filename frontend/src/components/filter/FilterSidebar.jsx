import { Sparkles, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

const PRICE_RANGES = [
  { value: "all", label: "Tất cả giá" },
  { value: "0-50000", label: "Dưới 50.000đ" },
  { value: "50000-100000", label: "50.000đ - 100.000đ" },
  { value: "100000-200000", label: "100.000đ - 200.000đ" },
  { value: "200000+", label: "Trên 200.000đ" },
];

const RATINGS = [5, 4, 3];

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
  onClearFilters,
  hasActive = false,
  sticky = true,
  className,
}) {
  return (
    <aside className={cn("w-full lg:w-64 shrink-0", className)}>
      <div
        className={cn(
          "bg-white rounded-2xl border border-gray-100 shadow-sm p-5",
          sticky && "lg:sticky lg:top-24"
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-semibold text-secondary-800 text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-500" />
            Bộ lọc
          </h3>
          {hasActive && (
            <Button
              variant="link"
              size="sm"
              onClick={onClearFilters}
              className="h-auto p-0 text-xs"
            >
              <X className="w-3 h-3" />
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
                      <span className="text-xs text-secondary-500">trở lên</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </AccordionContent>
          </AccordionItem>

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
