import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BookCard from "./BookCard";
import { cn } from "@/lib/utils";
import SectionHeader from "@/components/common/SectionHeader";

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
    <section className={cn(className)}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        size="lg"
        action={
          <>
            {action}
            <button
              onClick={() => scroll("left")}
              aria-label="Cuộn sang trái"
              className="hidden size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors duration-fast ease-out-soft hover:border-primary hover:text-primary sm:flex"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              aria-label="Cuộn sang phải"
              className="hidden size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors duration-fast ease-out-soft hover:border-primary hover:text-primary sm:flex"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        }
      />

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
