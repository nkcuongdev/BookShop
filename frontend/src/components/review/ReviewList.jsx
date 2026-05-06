import { useState } from "react";
import Rating from "@/components/common/Rating";
import EmptyState from "@/components/common/EmptyState";
import { MessageSquareText } from "lucide-react";
import { formatDateVN } from "@/utils/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ReviewList({ reviews = [] }) {
  const [filter, setFilter] = useState(0);

  if (!reviews.length) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="Chưa có đánh giá"
        description="Hãy là người đầu tiên đánh giá sản phẩm này."
      />
    );
  }

  const filtered =
    filter === 0 ? reviews : reviews.filter((r) => Math.floor(r.rating) === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-secondary-400 mr-2">
          Lọc:
        </span>
        <Button
          variant={filter === 0 ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter(0)}
        >
          Tất cả ({reviews.length})
        </Button>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = reviews.filter(
            (r) => Math.floor(r.rating) === star
          ).length;
          if (count === 0) return null;
          return (
            <Button
              key={star}
              variant={filter === star ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(star)}
            >
              {star}★ ({count})
            </Button>
          );
        })}
      </div>

      <div className="space-y-4">
        {filtered.map((review) => (
          <div
            key={review._id || review.id}
            className="bg-white border border-gray-100 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback>
                  {(review.userName || review.user?.name || "?")
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-secondary-800 text-sm">
                    {review.userName || review.user?.name || "Khách hàng"}
                  </p>
                  {review.verified && (
                    <Badge variant="info" className="text-[10px]">
                      Đã mua hàng
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Rating value={review.rating} size="xs" />
                  <span className="text-xs text-secondary-400">
                    {formatDateVN(review.createdAt)}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm text-secondary-700 leading-relaxed">
                    {review.comment}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
