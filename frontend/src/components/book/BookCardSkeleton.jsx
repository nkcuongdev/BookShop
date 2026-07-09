import { Skeleton } from "@/components/ui/skeleton";
import { bookGridVariants } from "@/components/book/BookGrid";

/**
 * Shape must track BookCard.jsx exactly, or the grid reflows when data lands.
 * Mirrors: aspect-[3/4] cover, 2-line title (min-h-[2.5rem]), author line,
 * rating row, and a bottom-pinned price row (mt-auto).
 */
export default function BookCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-rest">
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="flex flex-1 flex-col p-3.5">
        {/* title — 2 lines, matches BookCard's min-h-[2.5rem] */}
        <div className="min-h-[2.5rem] space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        {/* author */}
        <Skeleton className="mt-1 h-3 w-1/2" />
        {/* rating row — was missing, making the skeleton ~22px shorter */}
        <div className="mt-2 flex items-center gap-1.5">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-10" />
        </div>
        {/* price row — bottom-pinned like BookCard's mt-auto */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

/**
 * Reuses BookGrid's own class definition rather than restating it, so the
 * skeleton grid can never drift from the grid that replaces it.
 */
export function BookGridSkeleton({ count = 10, variant = "full" }) {
  return (
    <div className={bookGridVariants({ variant })}>
      {Array.from({ length: count }).map((_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </div>
  );
}
