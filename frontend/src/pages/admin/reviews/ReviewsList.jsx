import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, MessageSquare } from "lucide-react";
import { adminAPI } from "@/services/api";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatDateVN } from "@/utils/format";
import ReviewImages from "@/components/review/ReviewImages";

export default function ReviewsList() {
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [status, setStatus] = useState("all");
  const [reportedOnly, setReportedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moderating, setModerating] = useState("");
  const [hideReview, setHideReview] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const response = await adminAPI.getReviews({
        page,
        limit: 20,
        ...(status !== "all" ? { status } : {}),
        ...(reportedOnly ? { reported: 1 } : {}),
      });
      setReviews(response.data.reviews || []);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error(error.message || "Không thể tải đánh giá");
    } finally {
      setLoading(false);
    }
  }, [reportedOnly, status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(1), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const moderate = async (review, nextStatus, moderationReason = "") => {
    const id = review._id || review.id;
    setModerating(id);
    try {
      await adminAPI.moderateReview(id, { status: nextStatus, reason: moderationReason });
      toast.success(nextStatus === "hidden" ? "Đã ẩn đánh giá" : "Đã khôi phục đánh giá");
      setHideReview(null);
      setReason("");
      await load(pagination.page);
    } catch (error) {
      toast.error(error.message || "Không thể cập nhật đánh giá");
    } finally {
      setModerating("");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiểm duyệt đánh giá"
        description={`${pagination.total || 0} đánh giá trong bộ lọc hiện tại`}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="visible">Đang hiển thị</SelectItem>
            <SelectItem value="hidden">Đã ẩn</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={reportedOnly}
            onChange={(event) => setReportedOnly(event.target.checked)}
          />
          Chỉ review bị báo cáo
        </label>
        <Button variant="outline" size="sm" onClick={() => load(pagination.page)}>Tải lại</Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Đang tải...</p>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="mx-auto mb-2 size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Không có đánh giá phù hợp.</p>
          </div>
        ) : (
          <div className="divide-y">
            {reviews.map((review) => {
              const id = review._id || review.id;
              return (
                <article key={id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <strong>{review.user?.name || "Người dùng đã xóa"}</strong>
                      <span className="text-muted-foreground/70">·</span>
                      <span>{review.book?.title || "Sách đã xóa"}</span>
                      <Badge variant={review.status === "hidden" ? "destructive" : "success"}>
                        {review.status === "hidden" ? "Đã ẩn" : "Hiển thị"}
                      </Badge>
                      {review.reportCount > 0 && (
                        <Badge variant="warning">{review.reportCount} báo cáo</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-foreground">{review.rating}★ — {review.comment}</p>
                    <ReviewImages images={review.images} />
                    <p className="mt-1 text-xs text-muted-foreground/70">{formatDateVN(review.createdAt)}</p>
                    {review.moderation?.reason && (
                      <p className="mt-2 text-xs text-danger-strong">Lý do ẩn: {review.moderation.reason}</p>
                    )}
                    {review.reports?.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-lg bg-warning-muted p-2 text-xs text-warning-strong">
                        {review.reports.slice(0, 3).map((report) => (
                          <li key={report._id || `${report.reason}-${report.createdAt}`}>
                            <strong>{report.reason}</strong>
                            {report.details ? `: ${report.details}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    {review.status === "hidden" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={moderating === id}
                        onClick={() => moderate(review, "visible")}
                      >
                        <Eye className="size-4" /> Khôi phục
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setHideReview(review)}>
                        <EyeOff className="size-4" /> Ẩn
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={pagination.page <= 1 || loading} onClick={() => load(pagination.page - 1)}>
            Trước
          </Button>
          <span className="text-sm">Trang {pagination.page}/{pagination.totalPages}</span>
          <Button variant="outline" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => load(pagination.page + 1)}>
            Sau
          </Button>
        </div>
      )}

      <Dialog open={Boolean(hideReview)} onOpenChange={(open) => !open && setHideReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ẩn đánh giá</DialogTitle>
            <DialogDescription>Lý do được lưu trong lịch sử kiểm duyệt và không hiển thị công khai.</DialogDescription>
          </DialogHeader>
          <textarea
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Nhập lý do ẩn..."
            className="w-full resize-none rounded-xl border border-border p-3 text-sm focus:border-primary focus:outline-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHideReview(null)}>Hủy</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || moderating === (hideReview?._id || hideReview?.id)}
              onClick={() => moderate(hideReview, "hidden", reason.trim())}
            >
              Ẩn đánh giá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
