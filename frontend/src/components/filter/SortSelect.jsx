import { ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS = [
  { value: "relevance", label: "Liên quan nhất", searchOnly: true },
  { value: "bestseller", label: "Bán chạy nhất" },
  { value: "newest", label: "Mới nhất" },
  { value: "price-asc", label: "Giá: Thấp → Cao" },
  { value: "price-desc", label: "Giá: Cao → Thấp" },
  { value: "rating", label: "Đánh giá cao" },
  { value: "name", label: "Tên A → Z" },
];

export default function SortSelect({ value = "bestseller", onChange, showRelevance = false }) {
  const options = OPTIONS.filter((option) => !option.searchOnly || showRelevance);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[200px]">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="size-4 text-muted-foreground/70" />
          <SelectValue placeholder="Sắp xếp" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
