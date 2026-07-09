import Rating from "@/components/common/Rating";
import { cn } from "@/lib/utils";
import Progress from "@/components/ui/progress";

export default function RatingSummary({
  rating = 0,
  reviewCount = 0,
  reviews = [],
  ratingBreakdown = null,
  className,
}) {
  // The server counts every visible review per star. Without it the histogram
  // would only describe the reviews currently loaded, so it would shift each
  // time the reader pages through the list.
  const counts = ratingBreakdown
    ? [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: Number(ratingBreakdown[star]) || 0,
      }))
    : [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: reviews.filter((r) => Math.floor(r.rating) === star).length,
      }));

  const totalCount = counts.reduce((sum, row) => sum + row.count, 0);
  const histogram = counts.map(({ star, count }) => ({
    star,
    count,
    pct: totalCount ? (count / totalCount) * 100 : 0,
  }));

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-6 bg-card ring-1 ring-foreground/[0.06] shadow-rest rounded-2xl p-5",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center border-r border-border md:pr-6">
        <div className="text-5xl font-display font-bold text-foreground">
          {Number(rating).toFixed(1)}
        </div>
        <Rating value={rating} size="md" className="mt-2" />
        <p className="text-sm text-muted-foreground mt-2">
          {reviewCount || reviews.length} đánh giá
        </p>
      </div>
      <div className="space-y-2">
        {histogram.map((row) => (
          <div key={row.star} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-muted-foreground font-medium">
              {row.star}
            </span>
            <span className="text-warning">★</span>
            <Progress
              value={row.pct}
              intent="brand"
              className="flex-1"
              label={`${row.star} sao: ${row.count} đánh giá`}
            />
            <span className="text-xs text-muted-foreground/70 w-10 text-right">
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
