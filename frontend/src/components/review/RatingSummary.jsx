import Rating from "@/components/common/Rating";
import { cn } from "@/lib/utils";

export default function RatingSummary({
  rating = 0,
  reviewCount = 0,
  reviews = [],
  className,
}) {
  const histogram = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => Math.floor(r.rating) === star).length;
    const pct = reviews.length ? (count / reviews.length) * 100 : 0;
    return { star, count, pct };
  });

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-gray-100 rounded-2xl p-5",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center border-r border-gray-100 md:pr-6">
        <div className="text-5xl font-display font-bold text-secondary-800">
          {Number(rating).toFixed(1)}
        </div>
        <Rating value={rating} size="md" className="mt-2" />
        <p className="text-sm text-secondary-500 mt-2">
          {reviewCount || reviews.length} đánh giá
        </p>
      </div>
      <div className="space-y-2">
        {histogram.map((row) => (
          <div key={row.star} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-secondary-600 font-medium">
              {row.star}
            </span>
            <span className="text-amber-400">★</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                style={{ width: `${row.pct}%` }}
              />
            </div>
            <span className="text-xs text-secondary-400 w-10 text-right">
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
