import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, RefreshCw, Send, Users } from "lucide-react";
import { newsletterAPI } from "@/services/api";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDateVN } from "@/utils/format";

function promotionValue(item) {
  return item.type === "percent"
    ? `Giảm ${item.value}%`
    : `Giảm ${new Intl.NumberFormat("vi-VN").format(item.value)}đ`;
}

function contentList(contentType, overview) {
  if (contentType === "promotion") return overview?.promotions || [];
  if (contentType === "voucher") return overview?.vouchers || [];
  return overview?.posts || [];
}

export default function NewsletterManager() {
  const confirm = useConfirm();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contentType, setContentType] = useState("post");
  const [contentId, setContentId] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await newsletterAPI.getAdminOverview();
      setOverview(response.data || {});
    } catch (error) {
      toast.error(error.message || "Không thể tải thông tin newsletter");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const contents = useMemo(
    () => contentList(contentType, overview),
    [contentType, overview]
  );
  const selectedContent = contents.find(
    (item) => String(item.id || item._id) === contentId
  );

  const changeContentType = (value) => {
    setContentType(value);
    setContentId("");
    setLastResult(null);
  };

  const send = async () => {
    if (!selectedContent) {
      toast.error("Vui lòng chọn nội dung cần gửi");
      return;
    }
    const recipientCount = overview?.activeSubscriberCount || 0;
    if (!recipientCount) {
      toast.error("Chưa có subscriber đang hoạt động");
      return;
    }
    const accepted = await confirm({
      title: "Gửi newsletter?",
      description: `Nội dung “${selectedContent.title}” sẽ được gửi tới ${recipientCount} subscriber đang hoạt động.`,
      confirmText: "Gửi newsletter",
    });
    if (!accepted) return;

    setSending(true);
    setLastResult(null);
    try {
      const response = await newsletterAPI.sendContent({
        contentType,
        contentId,
      });
      const result = response.data || {};
      setLastResult(result);
      if (result.failedCount > 0) {
        toast.error(`Đã gửi một phần; ${result.failedCount} email thất bại`);
      } else if (result.previewCount > 0 && !result.deliveredCount) {
        toast.success("Đã xử lý bản xem thử; SMTP hiện chưa được cấu hình");
      } else {
        toast.success(`Đã gửi newsletter tới ${result.deliveredCount} người nhận`);
      }
    } catch (error) {
      toast.error(error.message || "Không thể gửi newsletter");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Newsletter"
        description="Gửi bài viết, voucher hoặc chương trình khuyến mãi còn hiệu lực tới người đã xác nhận đăng ký."
        actions={
          <Button variant="outline" onClick={load} loading={loading || sending}>
            <RefreshCw className="size-4" />
            Tải lại
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Subscriber đang hoạt động" icon={Users}>
          {loading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <p className="text-3xl font-bold text-foreground">
              {overview?.activeSubscriberCount || 0}
            </p>
          )}
          <p className="mt-2 text-base text-muted-foreground">
            Chỉ những email đã hoàn tất double opt-in mới nhận newsletter.
          </p>
        </SectionCard>

        <SectionCard title="Trạng thái gửi email" icon={Mail}>
          {loading ? (
            <Skeleton className="h-7 w-36" />
          ) : overview?.mailEnabled ? (
            <Badge variant="success">SMTP đã sẵn sàng</Badge>
          ) : (
            <Badge variant="warning">Chế độ xem thử</Badge>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {overview?.mailEnabled
              ? "Email sẽ được gửi riêng cho từng subscriber và luôn kèm liên kết hủy đăng ký."
              : "SMTP chưa được cấu hình nên hệ thống chỉ xử lý bản xem thử, không gửi email thật."}
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="Chọn nội dung gửi"
        description="Không chỉnh sửa nội dung tại đây; email dẫn về nội dung đang có trên BookShop."
        icon={Send}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Loại nội dung
            </label>
            <Select value={contentType} onValueChange={changeContentType}>
              <SelectTrigger aria-label="Loại nội dung">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post">Bài viết đã xuất bản</SelectItem>
                <SelectItem value="promotion">Khuyến mãi còn hiệu lực</SelectItem>
                <SelectItem value="voucher">Voucher còn hiệu lực</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Nội dung
            </label>
            <Select value={contentId} onValueChange={setContentId} disabled={loading}>
              <SelectTrigger aria-label="Nội dung newsletter">
                <SelectValue placeholder="Chọn nội dung" />
              </SelectTrigger>
              <SelectContent>
                {contents.map((item) => (
                  <SelectItem
                    key={String(item.id || item._id)}
                    value={String(item.id || item._id)}
                  >
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loading && contents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Không có nội dung phù hợp để gửi.
              </p>
            )}
          </div>
        </div>

        {selectedContent && (
          <div className="mt-5 rounded-xl border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">
                {selectedContent.title}
              </p>
              {["promotion", "voucher"].includes(contentType) && (
                <Badge variant="sale">{promotionValue(selectedContent)}</Badge>
              )}
            </div>
            {selectedContent.description && (
              <p className="mt-2 text-base text-muted-foreground">
                {selectedContent.description}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {contentType === "post"
                ? `Xuất bản: ${formatDateVN(selectedContent.publishedAt)}`
                : `Kết thúc: ${formatDateVN(selectedContent.endDate)}`}
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button
            onClick={send}
            disabled={sending || loading || !selectedContent}
              loading={sending}
          >
            <Send className="size-4" />
            {sending ? "Đang gửi..." : "Gửi newsletter"}
          </Button>
        </div>

        {lastResult && (
          <div className="mt-5 grid gap-3 rounded-xl border border-success/30 bg-success-muted p-4 sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Người nhận</p><p className="font-semibold">{lastResult.recipientCount}</p></div>
            <div><p className="text-xs text-muted-foreground">Đã gửi</p><p className="font-semibold text-success-strong">{lastResult.deliveredCount}</p></div>
            <div><p className="text-xs text-muted-foreground">Xem thử</p><p className="font-semibold text-warning-strong">{lastResult.previewCount}</p></div>
            <div><p className="text-xs text-muted-foreground">Thất bại</p><p className="font-semibold text-danger-strong">{lastResult.failedCount}</p></div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
