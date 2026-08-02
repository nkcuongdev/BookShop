import { useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useBooks } from "@/features/admin/books/hooks";
import useDebounce from "@/hooks/useDebounce";
import { formatVND } from "@/utils/format";
import { cn } from "@/lib/utils";

/**
 * Search-and-pick control for adding a book to a stock document.
 *
 * Shows current stock and cost inline so the person filling in the form can see
 * what they are about to move without leaving the page. Books already on the
 * document are marked and cannot be picked twice — duplicates would double-count
 * the movement.
 */
export function BookPicker({ onSelect, excludeIds = [], placeholder = "Tìm sách để thêm..." }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);
  const excluded = new Set(excludeIds.map(String));

  // useBooks passes raw=1, which is what makes the admin projection (costPrice,
  // inactive titles) available here.
  const booksQ = useBooks({
    ...(debounced ? { search: debounced } : {}),
    limit: 20,
  });
  const books = booksQ.data?.books || [];

  const handlePick = (book) => {
    if (excluded.has(String(book._id))) return;
    onSelect(book);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start font-normal text-muted-foreground"
        >
          <Search className="size-4" />
          {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(32rem,90vw)] p-0">
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            placeholder="Nhập tên sách, tác giả hoặc ISBN..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {booksQ.isLoading && (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tải...
            </div>
          )}
          {!booksQ.isLoading && books.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Không tìm thấy sách phù hợp
            </p>
          )}
          {books.map((book) => {
            const isExcluded = excluded.has(String(book._id));
            return (
              <button
                key={book._id}
                type="button"
                disabled={isExcluded}
                onClick={() => handlePick(book)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                  isExcluded
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-muted focus:bg-muted focus:outline-none"
                )}
              >
                {book.imageUrl ? (
                  <img
                    src={book.imageUrl}
                    alt=""
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="size-10 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {book.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Tồn: {book.stock ?? 0} · Giá vốn:{" "}
                    {book.costPrice > 0 ? formatVND(book.costPrice) : "chưa có"}
                  </p>
                </div>
                {isExcluded && <Check className="size-4 shrink-0 text-success-strong" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
