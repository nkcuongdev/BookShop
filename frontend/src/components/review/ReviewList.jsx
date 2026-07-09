import { useState } from "react";
import { Flag, Pencil, Trash2 } from "lucide-react";
import Rating from "@/components/common/Rating";
import ReviewForm from "@/components/review/ReviewForm";
import ReviewImages from "@/components/review/ReviewImages";
import EmptyState from "@/components/common/EmptyState";
import { formatDateVN } from "@/utils/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { NoReviewsIllustration } from "@/components/common/illustrations";
export default function ReviewList({
  bookId,
  reviews = [],
  totalCount = reviews.length,
  ratingBreakdown = null,
  selectedRating = 0,
  onRatingChange,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  currentUserId,
  onEdit,
  onDelete,
  onReport,
}) {
  const [editingId, setEditingId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reportReview, setReportReview] = useState(null);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDetails, setReportDetails] = useState("");

  const getDisplayName = (review) =>
    review.userName || review.user?.name || "Khách hàng";
  const getId = (review) => String(review._id || review.id || "");

  const run = async (key, action) => {
    setBusyId(key);
    try {
      await action();
    } finally {
      setBusyId("");
    }
  };

  if (!reviews.length && !selectedRating && totalCount === 0) {
    return (
      <EmptyState
        illustration={NoReviewsIllustration}
        title="Chưa có đánh giá"
        description="Hãy là người đầu tiên đánh giá sản phẩm này."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          Lọc:
        </span>
        <Button variant={selectedRating === 0 ? "default" : "outline"} size="sm" onClick={() => onRatingChange?.(0)}>
          Tất cả ({Object.values(ratingBreakdown || {}).reduce((sum, count) => sum + Number(count || 0), 0) || totalCount})
        </Button>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = ratingBreakdown
            ? Number(ratingBreakdown[star]) || 0
            : reviews.filter((review) => Math.floor(review.rating) === star).length;
          if (count === 0) return null;
          return (
            <Button
              key={star}
              variant={selectedRating === star ? "default" : "outline"}
              size="sm"
              onClick={() => onRatingChange?.(star)}
            >
              {star}★ ({count})
            </Button>
          );
        })}
      </div>

      <div className="space-y-4">
        {!reviews.length && selectedRating > 0 && (
          <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Chưa có đánh giá {selectedRating} sao.
          </p>
        )}
        {reviews.map((review) => {
          const id = getId(review);
          const displayName = getDisplayName(review);
          const isOwner = Boolean(currentUserId) && String(review.userId || "") === String(currentUserId);
          const isEditing = editingId === id;

          return (
            <div key={id} className="rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-rest p-5">
              <div className="flex items-start gap-3">
                <Avatar className="size-10">
                  <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{displayName}</p>
                    {currentUserId && !isEditing && (
                      <div className="flex items-center gap-1">
                        {isOwner ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(id)}>
                              <Pencil className="size-4" /> Sửa
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger-strong"
                              disabled={busyId === id}
                              onClick={() => void run(id, () => onDelete?.(review)).catch(() => {})}
                            >
                              <Trash2 className="size-4" /> Xóa
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setReportReview(review)}>
                            <Flag className="size-4" /> Báo cáo
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Rating value={review.rating} size="xs" />
                    <span className="text-xs text-muted-foreground/70">
                      {formatDateVN(review.createdAt)}
                      {review.updatedAt && review.updatedAt !== review.createdAt ? " · đã chỉnh sửa" : ""}
                    </span>
                  </div>
                  {isEditing ? (
                    <div className="mt-3">
                      <ReviewForm
                        bookId={bookId}
                        initialRating={review.rating}
                        initialComment={review.comment}
                        initialImages={review.images}
                        submitLabel="Lưu thay đổi"
                        submitting={busyId === id}
                        resetOnSuccess={false}
                        onCancel={() => setEditingId("")}
                        onSubmit={(rating, comment, images) =>
                          run(id, async () => {
                            await onEdit?.(review, rating, comment, images);
                            setEditingId("");
                          })
                        }
                      />
                    </div>
                  ) : (
                    <>
                      {review.comment && (
                        <p className="mt-2 text-sm leading-relaxed text-foreground">{review.comment}</p>
                      )}
                      <ReviewImages images={review.images} />
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onLoadMore} loading={loadingMore}>
            {loadingMore ? "Đang tải..." : "Xem thêm đánh giá"}
          </Button>
        </div>
      )}

      <Dialog open={Boolean(reportReview)} onOpenChange={(open) => !open && setReportReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Báo cáo đánh giá</DialogTitle>
            <DialogDescription>Chọn lý do phù hợp. Quản trị viên sẽ xem xét trước khi ẩn.</DialogDescription>
          </DialogHeader>
          <Select value={reportReason} onValueChange={setReportReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="spam">Spam hoặc quảng cáo</SelectItem>
              <SelectItem value="abuse">Ngôn từ xúc phạm</SelectItem>
              <SelectItem value="off_topic">Không liên quan sản phẩm</SelectItem>
              <SelectItem value="other">Lý do khác</SelectItem>
            </SelectContent>
          </Select>
          <textarea
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Mô tả thêm (không bắt buộc)"
            className="w-full resize-none rounded-xl border border-border p-3 text-sm focus:border-primary-500 focus:outline-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportReview(null)}>Hủy</Button>
            <Button
              disabled={busyId === "report"}
              onClick={() =>
                void run("report", async () => {
                  await onReport?.(reportReview, { reason: reportReason, details: reportDetails.trim() });
                  setReportReview(null);
                  setReportDetails("");
                }).catch(() => {})
              }
            >
              {busyId === "report" ? "Đang gửi..." : "Gửi báo cáo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
