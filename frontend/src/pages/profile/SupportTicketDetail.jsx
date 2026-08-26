import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Clock, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supportTicketsAPI } from "@/services/api";
import { useSupportTicketEvents } from "@/hooks/useSupportTicketEvents";
import { TICKET_STATUS, formatSla } from "@/features/support/constants";
import { cn } from "@/lib/utils";
import { formatDateTimeVN } from "@/utils/format";
import { RETURN_REASON_LABELS } from "@/features/returns/constants";

const RESOLUTION_TYPE_LABELS = {
  GUIDANCE: "Hướng dẫn / không thay đổi đơn",
  APPROVE_ORDER: "Xác nhận đơn hàng",
  CANCEL_ORDER: "Hủy đơn hàng",
  CREATE_SHIPMENT: "Tạo vận đơn",
  RETURN_REFUND: "Đổi/trả và hoàn tiền",
  PARTIAL_REFUND: "Hoàn tiền theo sản phẩm",
  RESHIP: "Giao bù hoặc giao lại",
  LOST_IN_TRANSIT_REFUND: "Đơn thất lạc — hoàn tiền",
  LOST_IN_TRANSIT_RESHIP: "Đơn thất lạc — giao lại",
};

const RESOLUTION_STATUS_LABELS = {
  INITIATING: "Đang khởi tạo",
  RETURNING: "Chờ gửi hàng trả",
  RETURN_COMPLETED: "Đổi trả hoàn tất",
  REFUND_PENDING: "Đang hoàn tiền",
  REFUND_MANUAL_REQUIRED: "Đang xử lý hoàn tiền",
  REFUND_COMPLETED: "Đã hoàn tiền",
  REFUND_FAILED: "Hoàn tiền chưa thành công",
  PREPARING: "Đang chuẩn bị hàng",
  SHIPPED: "Đang vận chuyển",
  DELIVERED: "Đã giao thành công",
  CANCELLED: "Đã hủy",
  FAILED: "Chưa thể khởi tạo",
  ACTION_PENDING: "Đang thực hiện",
  COMPLETED: "Đã hoàn tất",
};

export default function SupportTicketDetail() {
  const { ticketId } = useParams();
  const [text, setText] = useState("");
  const [olderMessages, setOlderMessages] = useState([]);
  const [olderPagination, setOlderPagination] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => supportTicketsAPI.getMineById(ticketId).then((res) => res.data),
    refetchInterval: 10000,
  });
  const onRealtime = useCallback(
    ({ ticketId: changed }) => {
      if (changed && String(changed) !== String(ticketId)) return;
      queryClient.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets", "mine"] });
    },
    [queryClient, ticketId]
  );
  useSupportTicketEvents(onRealtime);
  const mutation = useMutation({
    mutationFn: () => supportTicketsAPI.sendMessage(ticketId, text.trim()),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets", "mine"] });
    },
    onError: (error) => toast.error(error.message || "Không thể gửi tin nhắn"),
  });
  if (query.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-40" /><Skeleton className="h-72 rounded-2xl" /></div>;
  if (query.isError) return <Card className="p-6 text-sm text-danger-strong">{query.error.message}</Card>;
  const { ticket, messages: latestMessages = [], pagination } = query.data;
  const messages = [
    ...new Map(
      [...olderMessages, ...latestMessages].map((message) => [String(message._id), message])
    ).values(),
  ].sort((left, right) =>
    new Date(left.createdAt) - new Date(right.createdAt) ||
    String(left._id).localeCompare(String(right._id))
  );
  const activePagination = olderPagination || pagination;
  const loadOlder = async () => {
    if (!activePagination?.hasMore || !activePagination.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await supportTicketsAPI.getMineMessages(ticketId, {
        before: activePagination.nextCursor,
        limit: 50,
      });
      setOlderMessages((current) => [...(response.data?.messages || []), ...current]);
      setOlderPagination(response.data?.pagination || null);
    } catch (error) {
      toast.error(error.message || "Không thể tải tin nhắn cũ");
    } finally {
      setLoadingOlder(false);
    }
  };
  const status = TICKET_STATUS[ticket.status] || TICKET_STATUS.OPEN;
  const closed = ticket.status === "CLOSED";

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm"><Link to="/profile/support"><ArrowLeft className="size-4" /> Danh sách yêu cầu</Link></Button>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{ticket.ticketCode}</span><Badge className={status.className}>{status.label}</Badge></div><h1 className="mt-2 font-display text-h2 font-bold">{ticket.subject}</h1><p className="mt-1 text-sm text-muted-foreground">Đơn {ticket.order?.orderCode} · {ticket.categoryLabel}</p></div>
          <div className="text-right text-xs text-muted-foreground"><p className={ticket.sla?.responseBreached ? "text-danger-strong" : ""}><Clock className="mr-1 inline size-3" />Phản hồi: {formatSla(ticket.responseDueAt, ticket.firstRespondedAt, ticket.sla?.responseBreached)}</p><p className={cn("mt-1", ticket.sla?.resolutionBreached && "text-danger-strong")}>Giải quyết: {formatSla(ticket.effectiveResolutionDueAt || ticket.resolutionDueAt, ticket.resolvedAt, ticket.sla?.resolutionBreached, ticket.sla?.paused)}</p></div>
        </div>
        <div className="mt-4 rounded-xl bg-muted p-4 text-sm whitespace-pre-wrap">{ticket.description}</div>
        {ticket.requestDetails?.items?.length > 0 && <div className="mt-3 rounded-xl border p-3 text-sm"><p className="font-medium">Sản phẩm liên quan{ticket.itemIssueLabel ? ` · ${ticket.itemIssueLabel}` : ticket.requestDetails.returnReason ? ` · ${RETURN_REASON_LABELS[ticket.requestDetails.returnReason] || ticket.requestDetails.returnReason}` : ""}</p>{ticket.returnShippingPaidBy === "shop" ? <p className="mt-1 text-xs text-success-strong">Lỗi thuộc BookShop — BookShop chịu phí vận chuyển trả hàng.</p> : <p className="mt-1 text-xs text-muted-foreground">Phí vận chuyển trả hàng do bạn thanh toán.</p>}<div className="mt-2 space-y-1">{ticket.requestDetails.items.map((item) => <p key={item.book?._id || item.book}>{item.quantity}× {item.title}</p>)}</div></div>}
        {ticket.attachments?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{ticket.attachments.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Bằng chứng ${index + 1}`} className="size-24 rounded-xl border object-cover" /></a>)}</div>}
      </Card>
      {ticket.resolution && (
        <Card className="border-primary/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phương án xử lý đơn hàng</p><h2 className="mt-1 font-semibold">{RESOLUTION_TYPE_LABELS[ticket.resolution.type] || ticket.resolution.type}</h2></div>
            <Badge className="bg-info-muted text-info-strong">{RESOLUTION_STATUS_LABELS[ticket.resolution.status] || ticket.resolution.status}</Badge>
          </div>
          <div className="mt-3 space-y-1 text-sm">{ticket.resolution.items?.map((item) => <p key={item.book?._id || item.book}><strong>{item.quantity}×</strong> {item.title}</p>)}</div>
          {ticket.resolution.amount > 0 && <p className="mt-3 text-sm">Số tiền hoàn: <strong className="text-primary">{Number(ticket.resolution.amount).toLocaleString("vi-VN")}đ</strong></p>}
          {ticket.resolution.returnRequest?.returnCode && <div className="mt-3 rounded-lg bg-muted p-3 text-sm"><p>Mã trả hàng: <strong>{ticket.resolution.returnRequest.returnCode}</strong></p>{ticket.resolution.returnRequest.returnInstructions && <p className="mt-1 text-muted-foreground">{ticket.resolution.returnRequest.returnInstructions}</p>}</div>}
          {ticket.resolution.shipment?.trackingNumber && <div className="mt-3 rounded-lg bg-muted p-3 text-sm"><p>{ticket.resolution.shipment.carrier} · Mã vận đơn <strong>{ticket.resolution.shipment.trackingNumber}</strong></p>{ticket.resolution.shipment.estimatedDelivery && <p className="mt-1 text-muted-foreground">Dự kiến giao: {formatDateTimeVN(ticket.resolution.shipment.estimatedDelivery)}</p>}</div>}
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="border-b p-4"><h2 className="font-semibold">Trao đổi với bộ phận hỗ trợ</h2>{ticket.assignee && <p className="text-xs text-muted-foreground">Phụ trách: {ticket.assignee.name}</p>}</div>
        <div className="max-h-[460px] min-h-48 space-y-3 overflow-y-auto bg-muted/50 p-4">
          {activePagination?.hasMore && (
            <div className="text-center">
              <Button type="button" variant="ghost" size="sm" onClick={loadOlder} loading={loadingOlder}>
                Tải trao đổi cũ hơn
              </Button>
            </div>
          )}
          {!messages.length && <p className="py-10 text-center text-sm text-muted-foreground">Chưa có tin nhắn. Nhân viên hỗ trợ sẽ phản hồi tại đây.</p>}
          {messages.map((message) => <div key={message._id} className={cn("flex", message.from === "customer" ? "justify-end" : "justify-start")}><div className={cn("max-w-[80%] rounded-2xl px-4 py-2 text-sm", message.from === "customer" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-card shadow-sm")}><p className="whitespace-pre-wrap">{message.text}</p><p className={cn("mt-1 text-[10px]", message.from === "customer" ? "text-primary-foreground/70" : "text-muted-foreground")}>{message.sender?.name} · {formatDateTimeVN(message.createdAt)}</p></div></div>)}
        </div>
        <form className="flex gap-2 border-t p-3" onSubmit={(event) => { event.preventDefault(); if (text.trim()) mutation.mutate(); }}><Input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder={closed ? "Ticket đã đóng" : "Nhập tin nhắn..."} disabled={closed || mutation.isPending} /><Button type="submit" disabled={closed || !text.trim() || mutation.isPending}><Send className="size-4" /> Gửi</Button></form>
      </Card>
    </div>
  );
}
