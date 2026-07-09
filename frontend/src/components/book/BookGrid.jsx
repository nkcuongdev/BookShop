import { cva } from "class-variance-authority";
import BookCard from "@/components/book/BookCard";
import { cn } from "@/lib/utils";

/**
 * The book grid. One definition instead of four divergent class strings.
 *
 * `variant` exists because a page with a filter sidebar has one less column of
 * room at lg. Keeping both ramps here is what lets BookCardSkeleton match — the
 * skeleton previously rendered 5 columns at gap-6 on a page whose real grid was
 * 4 columns at gap-5, so the layout reflowed when data arrived.
 */
export const bookGridVariants = cva("grid gap-4 lg:gap-5", {
  variants: {
    variant: {
      full: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
      "with-sidebar":
        "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5",
      compact: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
    },
  },
  defaultVariants: { variant: "full" },
});

/**
 * @param books      book objects
 * @param variant    full | with-sidebar | compact
 * @param badgeFirst mark the first card as a bestseller (Home rails do this)
 * @param stagger    fade the cards up in sequence. Opt-in, not default: a grid
 *                   that re-renders on every filter change would replay the
 *                   animation each time, which reads as flicker.
 * @param children   render your own cards instead of the default mapping
 */
export default function BookGrid({
  books = [],
  variant,
  badgeFirst = false,
  stagger = false,
  onQuickView,
  className,
  children,
}) {
  return (
    <div
      className={cn(bookGridVariants({ variant }), stagger && "stagger-in", className)}
    >
      {children ??
        books.map((book, i) => (
          <BookCard
            key={book._id || book.id}
            book={book}
            badge={badgeFirst && i === 0 ? "bestseller" : undefined}
            onQuickView={onQuickView}
          />
        ))}
    </div>
  );
}
