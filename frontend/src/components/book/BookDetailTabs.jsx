import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RatingSummary from "@/components/review/RatingSummary";
import ReviewForm from "@/components/review/ReviewForm";
import ReviewList from "@/components/review/ReviewList";

export default function BookDetailTabs({
  book,
  canReview,
  hasReviewed,
  descExpanded,
  loadingMoreReviews,
  onLoadMoreReviews,
  onEditReview,
  onDeleteReview,
  onReportReview,
  onSubmitReview,
  ratingBreakdown,
  reviewRating,
  onReviewRatingChange,
  reviewPagination,
  reviews,
  setDescExpanded,
  submittingReview,
  user,
  specRows,
}) {
  return (
    <section className="page-container pb-10">
      <Tabs
        defaultValue={window.location.hash === "#reviews" ? "reviews" : "description"}
        className="w-full"
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="description">Mô tả</TabsTrigger>
          <TabsTrigger value="specs">Thông số</TabsTrigger>
          <TabsTrigger value="reviews" id="reviews">
            Đánh giá ({book.reviewCount || reviews.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description">
          <div className="bg-card rounded-2xl ring-1 ring-foreground/[0.06] shadow-rest p-6">
            <h2 className="text-h3 font-display font-bold text-foreground mb-3">
              Mô tả sản phẩm
            </h2>
            {book.description ? (
              <div className="relative">
                <div
                  className={cn(
                    "prose-content whitespace-pre-line",
                    !descExpanded && "line-clamp-[10]"
                  )}
                >
                  {book.description}
                </div>
                {book.description.length > 500 && (
                  <Button
                    variant="link"
                    className="mt-2 h-auto p-0"
                    onClick={() => setDescExpanded((value) => !value)}
                  >
                    {descExpanded ? "Thu gọn" : "Xem thêm"}
                  </Button>
                )}
              </div>
            ) : hasReviewed ? (
              <div className="rounded-xl border border-info/30 bg-info-muted p-4 text-sm text-info-strong">
                <ShieldCheck className="mr-1.5 inline-block size-4" />
                Bạn đã đánh giá sách này. Có thể sửa hoặc xóa đánh giá của mình bên dưới.
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Chưa có mô tả cho sách này.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="specs">
          <div className="bg-card rounded-2xl ring-1 ring-foreground/[0.06] shadow-rest p-6">
            <h2 className="text-h3 font-display font-bold text-foreground mb-4">
              Thông số chi tiết
            </h2>
            <dl className="divide-y divide-border">
              {specRows.map(([key, value]) => (
                <div key={key} className="grid grid-cols-3 py-3 text-sm gap-4">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="col-span-2 text-foreground font-medium break-words">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <RatingSummary
            rating={book.rating}
            reviewCount={book.reviewCount}
            reviews={reviews}
            ratingBreakdown={ratingBreakdown}
          />
          {user ? (
            canReview ? (
              <div>
                <h3 className="text-base font-display font-bold text-foreground mb-3">
                  Đánh giá của bạn
                </h3>
                <ReviewForm
                  bookId={book._id || book.id}
                  onSubmit={onSubmitReview}
                  submitting={submittingReview}
                />
              </div>
            ) : (
              <div className="bg-info-muted border border-info/30 rounded-xl p-4 text-sm text-info-strong">
                <ShieldCheck className="inline-block size-4 mr-1.5" />
                Bạn cần mua sách này mới có thể đánh giá.
              </div>
            )
          ) : (
            <div className="bg-muted border border-border rounded-xl p-4 text-sm text-muted-foreground">
              <Link to="/login" className="text-primary font-semibold hover:underline">
                Đăng nhập
              </Link>{" "}
              để chia sẻ đánh giá của bạn.
            </div>
          )}
          <ReviewList
            bookId={book._id || book.id}
            reviews={reviews}
            totalCount={reviewPagination.total}
            ratingBreakdown={ratingBreakdown}
            selectedRating={reviewRating}
            onRatingChange={onReviewRatingChange}
            hasMore={reviewPagination.page < reviewPagination.totalPages}
            loadingMore={loadingMoreReviews}
            onLoadMore={onLoadMoreReviews}
            currentUserId={user?._id || user?.id}
            onEdit={onEditReview}
            onDelete={onDeleteReview}
            onReport={onReportReview}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
