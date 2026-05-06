import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BookCard from "./BookCard";
import { cn } from "@/lib/utils";

export default function RecommendationRail({
  title,
  subtitle,
  books = [],
  action = null,
  className,
}) {
  const scrollRef = useRef(null);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.clientWidth * 0.85 * (dir === "left" ? -1 : 1);
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  if (!books.length) return null;

  return (
    <section className={cn("py-8", className)}>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-7 bg-primary-500 rounded-full" />
            <h2 className="text-xl lg:text-2xl font-display font-bold text-secondary-800">
              {title}
            </h2>
          </div>
          {subtitle && (
            <p className="text-sm text-secondary-500 mt-1.5 ml-3.5">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className="hidden sm:flex w-9 h-9 rounded-full border border-gray-200 bg-white items-center justify-center text-secondary-600 hover:border-primary-500 hover:text-primary-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className="hidden sm:flex w-9 h-9 rounded-full border border-gray-200 bg-white items-center justify-center text-secondary-600 hover:border-primary-500 hover:text-primary-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 lg:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-2"
      >
        {books.map((book) => (
          <div
            key={book._id || book.id}
            className="snap-start shrink-0 w-[160px] sm:w-[180px] md:w-[200px]"
          >
            <BookCard book={book} />
          </div>
        ))}
      </div>
    </section>
  );
}
