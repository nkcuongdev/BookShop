import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Send,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/admin/common/PageHeader";
import OrderResolutionPanel from "@/components/admin/support/OrderResolutionPanel";
import { supportTicketsAPI } from "@/services/api";
import { useSupportTicketEvents } from "@/hooks/useSupportTicketEvents";
import {
  TICKET_PRIORITY,
  TICKET_STATUS,
  formatSla,
} from "@/features/support/constants";
import { cn } from "@/lib/utils";
import { formatDateTimeVN } from "@/utils/format";
import { RETURN_REASON_LABELS } from "@/features/returns/constants";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

const statusOptions = Object.entries(TICKET_STATUS);
const priorityOptions = Object.entries(TICKET_PRIORITY);

export default function SupportTicketDetail() {
  const { user } = useAuth();
  const canWrite = can(user, "ticket.write");
  const canResolve = can(user, "ticket.resolve");
  const { ticketId } = useParams();
  const [text, setText] = useState("");
  const [olderMessages, setOlderMessages] = useState([]);
  const [olderPagination, setOlderPagination] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["admin", "support-ticket", ticketId],
    queryFn: () =>
      supportTicketsAPI.getAdminTicket(ticketId).then((response) => response.data),
    refetchInterval: 8000,
  });

  const agentsQuery = useQuery({
    queryKey: ["admin", "support-agents"],
    queryFn: () =>
      supportTicketsAPI.getAgents().then((response) => response.data.agents || []),
    enabled: canWrite,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["admin", "support-ticket", ticketId],
    });
    queryClient.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
  }, [queryClient, ticketId]);

  const onRealtime = useCallback(
    ({ ticketId: changed }) => {
      if (changed && String(changed) !== String(ticketId)) return;
      refresh();
    },
    [refresh, ticketId]
  );
  useSupportTicketEvents(onRealtime);

  const updateMutation = useMutation({
    mutationFn: (payload) => supportTicketsAPI.update(ticketId, payload),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(error.message || "Không thể cập nhật ticket"),
  });

  const sendMutation = useMutation({
    mutationFn: () => supportTicketsAPI.sendAdminMessage(ticketId, text.trim()),
    onSuccess: () => {
      setText("");
      refresh();
    },
    onError: (error) =>
      toast.error(error.message || "Không thể gửi phản hồi"),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-[520px] rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.ticket) {
    return (
      <Card className="p-6">
        <p className="text-sm text-danger-strong">
          {detailQuery.error?.message || "Không tìm thấy ticket"}
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/admin/support"><ArrowLeft className="size-4" /> Quay lại</Link>
        </Button>
      </Card>
    );
  }

  const ticket = detailQuery.data.ticket;
  const latestMessages = detailQuery.data.messages || [];
  const messages = [
    ...new Map(
      [...olderMessages, ...latestMessages].map((message) => [String(message._id), message])
    ).values(),
  ].sort((left, right) =>
    new Date(left.createdAt) - new Date(right.createdAt) ||
    String(left._id).localeCompare(String(right._id))
  );
  const activePagination = olderPagination || detailQuery.data.pagination;
  const loadOlder = async () => {
    if (!activePagination?.hasMore || !activePagination.nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await supportTicketsAPI.getAdminMessages(ticketId, {
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
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/support">
          <ArrowLeft className="size-4" /> Hàng đợi hỗ trợ
        </Link>
      </Button>

      <PageHeader
        title={ticket.subject}
        description={`${ticket.ticketCode} · ${ticket.user?.name} · Đơn ${ticket.order?.orderCode}`}
        actions={<Badge className={status.className}>{status.label}</Badge>}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Yêu cầu ban đầu · {ticket.categoryLabel}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {ticket.description}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateTimeVN(ticket.createdAt)}
              </p>
            </div>
            {ticket.attachments?.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <ImageIcon className="size-4" /> Bằng chứng đính kèm
                </p>
                <div className="flex flex-wrap gap-2">
                  {ticket.attachments.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt={`Bằng chứng ${index + 1}`}
                        className="size-24 rounded-xl border object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {ticket.requestDetails?.items?.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Sản phẩm khách yêu cầu đổi/trả
                  {ticket.requestDetails.returnReason
                    ? ` · ${RETURN_REASON_LABELS[ticket.requestDetails.returnReason] || ticket.requestDetails.returnReason}`
                    : ""}
                </p>
                <div className="mt-2 space-y-2">
                  {ticket.requestDetails.items.map((item) => (
                    <div key={item.book?._id || item.book} className="flex justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
                      <span className="truncate">{item.title}</span>
                      <strong className="shrink-0">{item.quantity}/{item.orderedQuantity}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold text-foreground">Lịch sử trao đổi</h2>
              <p className="text-xs text-muted-foreground">
                Phản hồi tại đây được hiển thị trong tài khoản khách hàng.
              </p>
            </div>
            <div className="min-h-48 space-y-4 bg-muted/40 p-5">
              {activePagination?.hasMore && (
                <div className="text-center">
                  <Button type="button" variant="ghost" size="sm" onClick={loadOlder} loading={loadingOlder}>
                    Tải trao đổi cũ hơn
                  </Button>
                </div>
              )}
              {messages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Chưa có phản hồi sau khi khách tạo yêu cầu.
                </p>
              )}
              {messages.map((message) => (
                <div
                  key={message._id}
                  className={cn(
                    "flex",
                    message.from === "admin" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                      message.from === "admin"
                        ? "rounded-tr-sm bg-primary text-primary-foreground"
                        : "rounded-tl-sm bg-card shadow-sm"
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        message.from === "admin"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {message.sender?.name} · {formatDateTimeVN(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {canWrite && (
            <Card className="p-4">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (text.trim()) sendMutation.mutate();
                }}
              >
                <label htmlFor="ticket-reply" className="text-sm font-semibold">
                  Phản hồi khách hàng
                </label>
                <Textarea
                  id="ticket-reply"
                  className="mt-2 min-h-28 resize-y"
                  maxLength={2000}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={closed ? "Ticket đã đóng" : "Nhập nội dung phản hồi..."}
                  disabled={closed || sendMutation.isPending}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {text.length}/2000 ký tự
                  </p>
                  <Button
                    type="submit"
                    disabled={closed || !text.trim() || sendMutation.isPending}
                    loading={sendMutation.isPending}
                  >
                    <Send className="size-4" /> Gửi phản hồi
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-20">
          <Card className="p-4">
            <h2 className="font-semibold text-foreground">Điều phối ticket</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-xs text-muted-foreground">
                Trạng thái
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
                  value={ticket.status}
                  disabled={!canWrite || updateMutation.isPending}
                  onChange={(event) =>
                    updateMutation.mutate({ status: event.target.value })
                  }
                >
                  {statusOptions.map(([value, item]) => (
                    <option key={value} value={value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Ưu tiên
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
                  value={ticket.priority}
                  disabled={!canWrite || updateMutation.isPending}
                  onChange={(event) =>
                    updateMutation.mutate({ priority: event.target.value })
                  }
                >
                  {priorityOptions.map(([value, item]) => (
                    <option key={value} value={value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Người phụ trách
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
                  value={ticket.assignee?._id || ""}
                  disabled={!canWrite || updateMutation.isPending}
                  onChange={(event) =>
                    updateMutation.mutate({ assigneeId: event.target.value || null })
                  }
                >
                  <option value="">Chưa phân công</option>
                  {(agentsQuery.data || []).map((agent) => (
                    <option key={agent._id} value={agent._id}>{agent.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-foreground">Thời hạn xử lý</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phản hồi đầu tiên</p>
                  <p className={ticket.sla?.responseBreached ? "text-danger-strong" : "font-medium"}>
                    {formatSla(
                      ticket.responseDueAt,
                      ticket.firstRespondedAt,
                      ticket.sla?.responseBreached
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Giải quyết</p>
                  <p className={ticket.sla?.resolutionBreached ? "text-danger-strong" : "font-medium"}>
                    {formatSla(
                      ticket.effectiveResolutionDueAt || ticket.resolutionDueAt,
                      ticket.resolvedAt,
                      ticket.sla?.resolutionBreached,
                      ticket.sla?.paused
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">{ticket.user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ticket.user?.email}
                </p>
              </div>
            </div>
            <Button asChild className="mt-4 w-full" variant="outline" size="sm">
              <Link to={`/admin/orders/${ticket.order?._id || ticket.order}`}>
                Mở đơn {ticket.order?.orderCode}
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          </Card>

          {canResolve && (
            <OrderResolutionPanel
              key={ticket._id}
              ticket={ticket}
              onChanged={refresh}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
