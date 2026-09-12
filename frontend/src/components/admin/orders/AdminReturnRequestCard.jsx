import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import ReturnRequestStatusBadge from "@/components/order/ReturnRequestStatusBadge";
import ReviewImages from "@/components/review/ReviewImages";
import { RETURN_REASON_LABELS } from "@/features/returns/constants";
import { formatDateTimeVN, formatVND } from "@/utils/format";

/**
 * `readOnly` renders the request without any resolve controls — for staff who
 * may read orders but hold no order.support permission.
 */
export default function AdminReturnRequestCard({
  request,
  onResolve,
  resolving,
  readOnly = false,
}) {
  const [adminNote, setAdminNote] = useState(request?.adminNote || "");
  const [restock, setRestock] = useState(true);
  const [refundTransactionId, setRefundTransactionId] = useState("");
  if (!request) return null;

  const resolve = (status) => {
    const note = adminNote.trim();
    if (status === "REJECTED" && note.length < 3) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }
    onResolve?.(status, note);
  };

  return (
    <section className="rounded-xl border border-warning/30 bg-warning-muted/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <RotateCcw className="size-4 text-warning-strong" />
            Yêu cầu đổi trả
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Gửi lúc {formatDateTimeVN(request.createdAt)}
          </p>
        </div>
        <ReturnRequestStatusBadge status={request.status} />
      </div>

      <div className="mt-3 rounded-lg bg-card p-3 text-sm">
        <p className="font-medium text-foreground">
          {RETURN_REASON_LABELS[request.reason] || request.reason}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{request.details}</p>
      </div>

      {(request.images || []).length > 0 && (
        <div className="mt-3 rounded-lg bg-card p-3">
          <p className="text-sm font-medium text-foreground">Ảnh bằng chứng</p>
          <ReviewImages
            images={request.images}
            className="mt-2"
            imageLabel="ảnh bằng chứng đổi trả"
            dialogTitle="Ảnh bằng chứng đổi trả"
            dialogDescription="Ảnh khách hàng cung cấp để hỗ trợ đánh giá yêu cầu."
          />
        </div>
      )}

      <ul className="mt-3 divide-y divide-warning/30 rounded-lg border border-warning/30 bg-card px-3">
        {(request.items || []).map((item) => (
          <li
            key={String(item.book?._id || item.book)}
            className="flex items-center justify-between gap-3 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{formatVND(item.unitPrice)}</p>
            </div>
            <span className="shrink-0 text-muted-foreground">
              Trả {item.quantity}/{item.orderedQuantity}
            </span>
          </li>
        ))}
      </ul>

      {request.expectedRefundAmount > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-card p-3 text-sm">
          <span className="text-muted-foreground">Số tiền hoàn dự kiến</span>
          <strong className="text-foreground">{formatVND(request.expectedRefundAmount)}</strong>
        </div>
      )}

      {!readOnly && request.status === "PENDING" ? (
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor={`return-admin-note-${request._id || request.id}`}
              className="mb-1.5 block text-xs font-medium text-foreground"
            >
              Phản hồi cho khách
            </label>
            <Textarea
              id={`return-admin-note-${request._id || request.id}`}
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Hướng dẫn tiếp nhận nếu duyệt; bắt buộc nêu lý do nếu từ chối."
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-danger-strong/40 text-danger-strong hover:bg-danger-muted"
              loading={resolving}
              onClick={() => resolve("REJECTED")}
            >
              <XCircle className="size-4" />
              Từ chối
            </Button>
            <Button
              type="button"
              loading={resolving}
              onClick={() => resolve("APPROVED")}
            >
              <CheckCircle2 className="size-4" />
              Duyệt yêu cầu
            </Button>
          </div>
        </div>
      ) : !readOnly && (request.status === "RETURNING" || request.status === "APPROVED") ? (
        <div className="mt-4 space-y-3 rounded-lg bg-card p-3 text-sm text-foreground">
          <p className="font-medium">Mã trả hàng: {request.returnCode || "—"}</p>
          <p className="whitespace-pre-wrap">
            {request.returnInstructions || request.adminNote || "Chờ khách gửi sản phẩm về."}
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={restock}
              onChange={(event) => setRestock(event.target.checked)}
              disabled={resolving}
            />
            Sản phẩm đủ điều kiện nhập lại kho
          </label>
          <div className="flex justify-end">
            <Button
              type="button"
              loading={resolving}
              onClick={() => onResolve?.("RECEIVED", adminNote.trim(), { restock })}
            >
              <CheckCircle2 className="size-4" />
              Xác nhận đã nhận hàng
            </Button>
          </div>
        </div>
      ) : !readOnly &&
        request.status === "RECEIVED" &&
        request.refund?.status === "MANUAL_REQUIRED" ? (
        <div className="mt-4 space-y-3 rounded-lg bg-card p-3 text-sm text-foreground">
          <p>Đơn COD cần hoàn tiền thủ công trước khi đóng yêu cầu.</p>
          <input
            type="text"
            value={refundTransactionId}
            onChange={(event) => setRefundTransactionId(event.target.value)}
            maxLength={250}
            placeholder="Mã giao dịch hoàn tiền"
            className="h-10 w-full rounded-lg border border-border px-3"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={resolving || refundTransactionId.trim().length < 3}
              loading={resolving}
              onClick={() => onResolve?.("CLOSED", adminNote.trim(), {
                refundTransactionId: refundTransactionId.trim(),
              })}
            >
              Hoàn tất yêu cầu
            </Button>
          </div>
        </div>
      ) : readOnly && !request.resolvedAt ? (
        <div className="mt-4 rounded-lg bg-card p-3 text-sm text-muted-foreground">
          Yêu cầu đang chờ bộ phận chăm sóc khách hàng xử lý.
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-card p-3 text-sm text-foreground">
          <p className="font-medium">
            Phản hồi lúc {formatDateTimeVN(request.resolvedAt)}
          </p>
          <p className="mt-1 whitespace-pre-wrap">
            {request.adminNote || "Không có ghi chú bổ sung."}
          </p>
          {request.refund?.status === "PENDING" && (
            <p className="mt-2 text-violet-700">Cổng thanh toán đang xử lý hoàn tiền.</p>
          )}
          {request.refund?.transactionId && (
            <p className="mt-2 font-mono text-xs">Mã hoàn tiền: {request.refund.transactionId}</p>
          )}
        </div>
      )}
    </section>
  );
}
