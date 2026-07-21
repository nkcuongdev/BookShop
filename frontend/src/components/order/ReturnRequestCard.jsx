import { useState } from "react";
import { CalendarClock, PackageOpen, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ordersAPI } from "@/services/api";
import ReviewImages from "@/components/review/ReviewImages";
import {
  RETURN_REASON_LABELS,
  RETURN_REASON_OPTIONS,
} from "@/features/returns/constants";
import { formatDateTimeVN, formatDateVN, formatVND } from "@/utils/format";
import ReturnRequestStatusBadge from "./ReturnRequestStatusBadge";
import ReturnEvidenceUploader from "./ReturnEvidenceUploader";

function getBookId(item) {
  return String(item?.book?._id || item?.book || item?.bookId || "");
}

function eligibilityMessage(eligibility) {
  if (!eligibility || eligibility.eligible) return "";
  const messages = {
    RETURN_WINDOW_EXPIRED: "Đã hết thời hạn gửi yêu cầu đổi trả.",
    DELIVERY_DATE_MISSING: "Đơn hàng chưa có thời điểm giao hợp lệ.",
    ORDER_NOT_DELIVERED: "Chỉ đơn hàng đã giao mới có thể yêu cầu đổi trả.",
    RETURN_QUANTITY_EXHAUSTED: "Đã sử dụng hết số lượng có thể đổi trả của đơn hàng.",
  };
  return messages[eligibility.code] || "Đơn hàng hiện không đủ điều kiện đổi trả.";
}

function ExistingReturnRequest({ request }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <RotateCcw className="size-4 text-primary" />
            Yêu cầu đổi trả
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Gửi lúc {formatDateTimeVN(request.createdAt)}
          </p>
        </div>
        <ReturnRequestStatusBadge status={request.status} />
      </div>

      <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
        <p className="font-medium text-foreground">
          {RETURN_REASON_LABELS[request.reason] || request.reason}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
          {request.details}
        </p>
      </div>

      {(request.images || []).length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">Ảnh bằng chứng</p>
          <ReviewImages
            images={request.images}
            className="mt-2"
            imageLabel="ảnh bằng chứng đổi trả"
            dialogTitle="Ảnh bằng chứng đổi trả"
            dialogDescription="Ảnh do khách hàng cung cấp cùng yêu cầu đổi trả."
          />
        </div>
      )}

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border px-3">
        {(request.items || []).map((item) => (
          <li key={getBookId(item)} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.title}
              </p>
              {item.author && (
                <p className="truncate text-xs text-muted-foreground">{item.author}</p>
              )}
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">
              Trả {item.quantity}/{item.orderedQuantity}
            </span>
          </li>
        ))}
      </ul>

      {request.status === "PENDING" && (
        <p className="mt-4 text-sm text-warning-strong">
          BookShop đang xem xét yêu cầu. Kết quả sẽ được cập nhật tại đây và qua thông báo.
        </p>
      )}
      {["APPROVED", "RETURNING"].includes(request.status) && (
        <div className="mt-4 rounded-xl border border-success/30 bg-success-muted p-3 text-sm text-success-strong">
          <p className="font-medium">
            Yêu cầu đã được duyệt{request.returnCode ? ` · Mã trả hàng ${request.returnCode}` : ""}.
          </p>
          <p className="mt-1 whitespace-pre-wrap">
            {request.returnInstructions || request.adminNote || "BookShop sẽ liên hệ để hướng dẫn bước tiếp theo."}
          </p>
        </div>
      )}
      {request.status === "RECEIVED" && (
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-100 p-3 text-sm text-violet-800">
          <p className="font-medium">BookShop đã nhận sản phẩm trả.</p>
          <p className="mt-1">
            Số tiền hoàn dự kiến: {formatVND(request.expectedRefundAmount || request.refund?.amount || 0)}.
            {request.refund?.status === "MANUAL_REQUIRED"
              ? " Bộ phận hỗ trợ đang thực hiện hoàn tiền thủ công."
              : " Cổng thanh toán đang xử lý giao dịch hoàn tiền."}
          </p>
        </div>
      )}
      {request.status === "CLOSED" && (
        <div className="mt-4 rounded-xl border border-success/30 bg-success-muted p-3 text-sm text-success-strong">
          <p className="font-medium">Yêu cầu đổi trả đã hoàn tất.</p>
          <p className="mt-1">
            Đã hoàn {formatVND(request.refund?.amount || request.expectedRefundAmount || 0)}
            {request.refund?.transactionId ? ` · Mã giao dịch ${request.refund.transactionId}` : ""}.
          </p>
        </div>
      )}
      {request.status === "REJECTED" && (
        <div className="mt-4 rounded-xl border border-danger-strong/40 bg-danger-muted p-3 text-sm text-danger-strong">
          <p className="font-medium">Lý do từ chối</p>
          <p className="mt-1 whitespace-pre-wrap">
            {request.adminNote || "Yêu cầu chưa đáp ứng chính sách đổi trả."}
          </p>
        </div>
      )}
    </Card>
  );
}

export default function ReturnRequestCard({ order, onChanged }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [images, setImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(
      (order?.items || [])
        .map((item) => getBookId(item))
        .filter(Boolean)
        .map((bookId) => [bookId, { selected: false, quantity: 1 }])
    )
  );

  if (!order) return null;
  const requests = order.returnRequests?.length
    ? order.returnRequests
    : order.returnRequest
      ? [order.returnRequest]
      : [];
  const requestHistory = requests.map((request) => (
    <ExistingReturnRequest key={request._id || request.id} request={request} />
  ));
  if (order.status !== "DELIVERED") {
    return requestHistory.length ? <div className="space-y-4">{requestHistory}</div> : null;
  }

  const eligibility = order.returnEligibility;
  const canRequest = eligibility?.eligible === true;
  const deadline = eligibility?.deadline;
  const remainingByBook = new Map(
    (eligibility?.remainingItems || []).map((item) => [String(item.bookId), Number(item.quantity) || 0])
  );
  const remainingFor = (item) =>
    eligibility?.remainingItems
      ? remainingByBook.get(getBookId(item)) || 0
      : Number(item.quantity) || 0;

  const updateSelection = (bookId, patch) => {
    setSelections((current) => ({
      ...current,
      [bookId]: { ...current[bookId], ...patch },
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (uploadingImages) {
      toast.error("Vui lòng chờ ảnh tải lên hoàn tất");
      return;
    }
    const items = (order.items || [])
      .map((item) => {
        const bookId = getBookId(item);
        const selection = selections[bookId];
        return selection?.selected
          ? { bookId, quantity: Number(selection.quantity) }
          : null;
      })
      .filter(Boolean);
    if (items.length === 0) {
      toast.error("Vui lòng chọn ít nhất một sản phẩm");
      return;
    }
    if (!reason) {
      toast.error("Vui lòng chọn lý do đổi trả");
      return;
    }
    if (details.trim().length < 10) {
      toast.error("Mô tả cần ít nhất 10 ký tự");
      return;
    }

    setSubmitting(true);
    try {
      const response = await ordersAPI.createReturnRequest(order._id || order.id, {
        items,
        reason,
        details: details.trim(),
        images,
      });
      toast.success(response?.message || "Đã gửi yêu cầu đổi trả");
      setImages([]);
      setOpen(false);
      await onChanged?.();
    } catch (error) {
      toast.error(error.message || "Không thể gửi yêu cầu đổi trả");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {requestHistory}
      <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <RotateCcw className="size-4 text-primary" />
            Đổi trả sau giao hàng
          </h3>
          {deadline && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-4" />
              Thời hạn gửi yêu cầu: {formatDateVN(deadline)}
            </p>
          )}
          {!canRequest && (
            <p className="mt-1 text-sm text-muted-foreground">
              {eligibilityMessage(eligibility)}
            </p>
          )}
        </div>
        {canRequest && (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <PackageOpen className="size-4" />
            Tạo yêu cầu đổi trả
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yêu cầu đổi trả</DialogTitle>
            <DialogDescription>
              Chọn sản phẩm và số lượng cần trả. Bạn có thể gửi nhiều hồ sơ miễn không trùng số lượng đã yêu cầu.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">
                Sản phẩm cần đổi trả
              </legend>
              {(order.items || []).filter((item) => remainingFor(item) > 0).map((item) => {
                const bookId = getBookId(item);
                const selection = selections[bookId] || {
                  selected: false,
                  quantity: 1,
                };
                return (
                  <div
                    key={bookId}
                    className="flex items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <Checkbox
                      id={`return-${bookId}`}
                      checked={selection.selected}
                      onCheckedChange={(checked) =>
                        updateSelection(bookId, { selected: checked === true })
                      }
                    />
                    <Label htmlFor={`return-${bookId}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block truncate text-foreground">{item.title}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {formatVND(item.price)} · Còn có thể yêu cầu {remainingFor(item)}/{item.quantity}
                      </span>
                    </Label>
                    <div className="w-24">
                      <Label htmlFor={`return-qty-${bookId}`} className="sr-only">
                        Số lượng trả của {item.title}
                      </Label>
                      <Input
                        id={`return-qty-${bookId}`}
                        type="number"
                        min={1}
                        max={remainingFor(item)}
                        value={selection.quantity}
                        disabled={!selection.selected}
                        onChange={(event) =>
                          updateSelection(bookId, {
                            quantity: Number(event.target.value),
                          })
                        }
                        aria-label={`Số lượng trả của ${item.title}`}
                      />
                    </div>
                  </div>
                );
              })}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="return-reason">Lý do</Label>
              <select
                id="return-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                required
              >
                <option value="">Chọn lý do đổi trả</option>
                {RETURN_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="return-details">Mô tả tình trạng</Label>
              <Textarea
                id="return-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                minLength={10}
                maxLength={1000}
                rows={4}
                placeholder="Mô tả cụ thể tình trạng sản phẩm, phần bị thiếu hoặc sai lệch..."
                required
              />
              <p className="text-right text-xs text-muted-foreground/70">
                {details.length}/1000
              </p>
            </div>

            <ReturnEvidenceUploader
              orderId={order._id || order.id}
              images={images}
              onChange={setImages}
              onUploadingChange={setUploadingImages}
              disabled={submitting}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="submit" loading={submitting || uploadingImages}>
                {submitting ? "Đang gửi..." : "Gửi yêu cầu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </Card>
    </div>
  );
}
