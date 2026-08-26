import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Headphones, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/common/EmptyState";
import SupportEvidenceUploader from "@/components/support/SupportEvidenceUploader";
import { ordersAPI, supportTicketsAPI } from "@/services/api";
import { useSupportTicketEvents } from "@/hooks/useSupportTicketEvents";
import {
  ITEM_ISSUE_OPTIONS,
  ITEM_PICKER_CATEGORIES,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_HINTS,
  TICKET_STATUS,
} from "@/features/support/constants";
import { formatDateTimeVN, formatOrderCode, formatVND } from "@/utils/format";

const EMPTY_FORM = {
  orderId: "",
  category: "",
  subject: "",
  description: "",
  attachments: [],
  itemIssue: "",
  requestedItems: {},
};

const bookIdOf = (item) => String(item?.book?._id || item?.book || item?.bookId || "");

export default function SupportTickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOrderId = searchParams.get("orderId") || "";
  const [showForm, setShowForm] = useState(Boolean(initialOrderId));
  const [form, setForm] = useState({ ...EMPTY_FORM, orderId: initialOrderId });
  const queryClient = useQueryClient();
  const ticketsQuery = useQuery({
    queryKey: ["support-tickets", "mine"],
    queryFn: () => supportTicketsAPI.getMine().then((res) => res.data.tickets || []),
  });
  const ordersQuery = useQuery({
    queryKey: ["orders", "ticket-picker"],
    queryFn: () => ordersAPI.getMyOrders({ limit: 50 }).then((res) => res.data.orders || []),
  });
  const selectedOrderQuery = useQuery({
    queryKey: ["orders", "ticket-picker", form.orderId],
    queryFn: () => ordersAPI.getById(form.orderId).then((res) => res.data.order),
    enabled: Boolean(form.orderId),
  });
  const selectedOrder = selectedOrderQuery.data;
  const selectedReturnItems = useMemo(
    () =>
      (selectedOrder?.items || [])
        .map((item) => {
          const bookId = bookIdOf(item);
          const selection = form.requestedItems[bookId];
          return selection?.selected
            ? { bookId, quantity: Number(selection.quantity) }
            : null;
        })
        .filter(Boolean),
    [selectedOrder, form.requestedItems]
  );
  const onRealtime = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["support-tickets", "mine"] });
  }, [queryClient]);
  useSupportTicketEvents(onRealtime);
  const createMutation = useMutation({
    mutationFn: (payload) => supportTicketsAPI.create(payload),
    onSuccess: () => {
      toast.success("Đã gửi yêu cầu hỗ trợ");
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSearchParams({});
      queryClient.invalidateQueries({ queryKey: ["support-tickets", "mine"] });
    },
    onError: (error) => {
      // A duplicate is not a dead end: point the customer at the open thread.
      if (error.code === "DUPLICATE_TICKET" || error.code === "TOO_MANY_OPEN_TICKETS") {
        toast.error(error.message, {
          action: {
            label: "Xem yêu cầu",
            onClick: () => {
              setShowForm(false);
              queryClient.invalidateQueries({ queryKey: ["support-tickets", "mine"] });
            },
          },
        });
        return;
      }
      toast.error(error.message || "Không thể tạo ticket");
    },
  });

  const submit = (event) => {
    event.preventDefault();
    if (!form.orderId || !form.category || !form.description.trim()) {
      toast.error("Vui lòng chọn đơn hàng, loại vấn đề và nhập mô tả");
      return;
    }
    if (ITEM_PICKER_CATEGORIES.has(form.category)) {
      // A shop-fault claim has its own, longer window, so the order's
      // change-of-mind eligibility must not gate it here; the server decides.
      if (form.category === "RETURN_REQUEST" && selectedOrder?.returnEligibility?.eligible !== true) {
        toast.error("Đơn hàng hiện không đủ điều kiện đổi trả");
        return;
      }
      if (form.category === "ITEM_FAULT" && !form.itemIssue) {
        toast.error("Vui lòng chọn tình trạng sản phẩm");
        return;
      }
      if (!selectedReturnItems.length) {
        toast.error("Vui lòng chọn ít nhất một sản phẩm liên quan");
        return;
      }
      if (form.description.trim().length < 10) {
        toast.error("Mô tả cần ít nhất 10 ký tự");
        return;
      }
    }
    createMutation.mutate({
      ...form,
      requestedItems: selectedReturnItems,
    });
  };

  const updateRequestedItem = (bookId, patch) => {
    setForm((current) => ({
      ...current,
      requestedItems: {
        ...current.requestedItems,
        [bookId]: { quantity: 1, ...current.requestedItems[bookId], ...patch },
      },
    }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-h2 font-bold text-foreground">Yêu cầu hỗ trợ</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi vấn đề về đơn hàng và trao đổi với nhân viên phụ trách.</p>
        </div>
        <Button onClick={() => setShowForm((value) => !value)}>
          <Plus className="size-4" /> Tạo yêu cầu
        </Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <h2 className="font-semibold text-foreground">Yêu cầu mới</h2>
              <p className="text-sm text-muted-foreground">Chọn đúng đơn hàng để chúng tôi xử lý nhanh hơn.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ticket-order">Đơn hàng</Label>
                <select id="ticket-order" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.orderId} onChange={(event) => setForm((current) => ({ ...current, orderId: event.target.value, attachments: [], requestedItems: {}, itemIssue: "" }))}>
                  <option value="">Chọn đơn hàng</option>
                  {(ordersQuery.data || []).map((order) => <option key={order._id || order.id} value={order._id || order.id}>{formatOrderCode(order)} — {order.status}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-category">Loại vấn đề</Label>
                <select id="ticket-category" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                  <option value="">Chọn loại vấn đề</option>
                  {SUPPORT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            {selectedOrderQuery.isLoading && <Skeleton className="h-9 rounded-lg" />}
            {selectedOrder && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Đơn {formatOrderCode(selectedOrder)} · đặt lúc {formatDateTimeVN(selectedOrder.placedAt || selectedOrder.createdAt)}</p>}
            {form.category && SUPPORT_CATEGORY_HINTS[form.category] && (
              <p className="rounded-lg bg-info-muted px-3 py-2 text-xs text-info-strong">
                {SUPPORT_CATEGORY_HINTS[form.category]}
              </p>
            )}
            {form.category === "ITEM_FAULT" && (
              <div className="space-y-2">
                <Label htmlFor="ticket-item-issue">Tình trạng sản phẩm</Label>
                <select
                  id="ticket-item-issue"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.itemIssue}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, itemIssue: event.target.value }))
                  }
                >
                  <option value="">Chọn tình trạng</option>
                  {ITEM_ISSUE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            {ITEM_PICKER_CATEGORIES.has(form.category) && selectedOrder && (
              <div className="space-y-4 rounded-xl border p-4">
                <div>
                  <h3 className="text-sm font-semibold">Sản phẩm liên quan</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chọn đúng sản phẩm và số lượng để bộ phận hỗ trợ xử lý nhanh hơn.
                  </p>
                </div>
                {form.category === "RETURN_REQUEST" &&
                selectedOrder.returnEligibility?.eligible !== true ? (
                  <p className="rounded-lg bg-warning-muted p-3 text-sm text-warning-strong">
                    Đơn hàng đã quá thời hạn đổi trả {selectedOrder.returnEligibility?.windowDays || 7} ngày.
                    Nếu hàng bị lỗi, sai hoặc thiếu, hãy chọn “Hàng bị lỗi, sai hoặc thiếu”.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(selectedOrder.items || []).map((item) => {
                      const bookId = bookIdOf(item);
                      const selection = form.requestedItems[bookId] || {
                        selected: false,
                        quantity: 1,
                      };
                      return (
                        <div key={bookId} className="flex items-center gap-3 rounded-lg border p-3">
                          <Checkbox
                            id={`support-item-${bookId}`}
                            checked={selection.selected}
                            onCheckedChange={(checked) =>
                              updateRequestedItem(bookId, { selected: checked === true })
                            }
                          />
                          <Label htmlFor={`support-item-${bookId}`} className="min-w-0 flex-1 cursor-pointer">
                            <span className="block truncate">{item.title}</span>
                            <span className="block text-xs font-normal text-muted-foreground">
                              {formatVND(item.price)} · Đã mua {item.quantity}
                            </span>
                          </Label>
                          <Input
                            className="w-24"
                            type="number"
                            min={1}
                            max={item.quantity}
                            value={selection.quantity}
                            disabled={!selection.selected}
                            onChange={(event) =>
                              updateRequestedItem(bookId, {
                                quantity: Number(event.target.value),
                              })
                            }
                            aria-label={`Số lượng của ${item.title}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Tiêu đề (không bắt buộc)</Label>
              <Input id="ticket-subject" maxLength={160} value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Tóm tắt vấn đề" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-description">Mô tả vấn đề</Label>
              <Textarea id="ticket-description" rows={5} maxLength={4000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Mô tả điều đã xảy ra và kết quả bạn mong muốn..." />
            </div>
            <SupportEvidenceUploader orderId={form.orderId} images={form.attachments} onChange={(attachments) => setForm((current) => ({ ...current, attachments }))} disabled={createMutation.isPending} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
              <Button type="submit" disabled={createMutation.isPending} loading={createMutation.isPending}><Send className="size-4" /> Gửi yêu cầu</Button>
            </div>
          </form>
        </Card>
      )}

      {ticketsQuery.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div>
      ) : !ticketsQuery.data?.length ? (
        <Card className="p-6"><EmptyState icon={Headphones} title="Chưa có yêu cầu hỗ trợ" description="Các yêu cầu liên quan đến đơn hàng sẽ xuất hiện tại đây." /></Card>
      ) : (
        <div className="space-y-3">
          {ticketsQuery.data.map((ticket) => {
            const status = TICKET_STATUS[ticket.status] || TICKET_STATUS.OPEN;
            return (
              <Link key={ticket._id} to={`/profile/support/${ticket._id}`} className="block">
                <Card className="p-4 transition-colors hover:border-primary/30">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{ticket.ticketCode}</span><Badge className={status.className}>{status.label}</Badge></div>
                      <h2 className="mt-2 font-semibold text-foreground">{ticket.subject}</h2>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{ticket.lastMessagePreview || ticket.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Đơn {ticket.order?.orderCode} · cập nhật {formatDateTimeVN(ticket.lastMessageAt)}</p>
                    </div>
                    <ChevronRight className="mt-1 size-5 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
