import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Headphones,
  Search,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { supportTicketsAPI } from "@/services/api";
import { useSupportTicketEvents } from "@/hooks/useSupportTicketEvents";
import {
  TICKET_PRIORITY,
  TICKET_STATUS,
  formatSla,
} from "@/features/support/constants";
import { formatDateTimeVN } from "@/utils/format";

const statusOptions = Object.entries(TICKET_STATUS);
const priorityOptions = Object.entries(TICKET_PRIORITY);

export default function SupportTicketQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    priority: "",
    assignee: "",
  });

  const listQuery = useQuery({
    queryKey: ["admin", "support-tickets", filters, page],
    queryFn: () =>
      supportTicketsAPI
        .getAdminTickets({ ...filters, page, limit: 20 })
        .then((response) => response.data),
    placeholderData: (previous) => previous,
    refetchInterval: 10000,
  });

  const agentsQuery = useQuery({
    queryKey: ["admin", "support-agents"],
    queryFn: () =>
      supportTicketsAPI.getAgents().then((response) => response.data.agents || []),
  });

  const onRealtime = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin", "support-tickets"] });
  }, [queryClient]);
  useSupportTicketEvents(onRealtime);

  const tickets = listQuery.data?.tickets || [];
  const pagination = listQuery.data?.pagination || {
    total: 0,
    page: 1,
    totalPages: 1,
  };

  const updateFilter = (name, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hàng đợi hỗ trợ"
        description="Phân công, theo dõi SLA và xử lý yêu cầu theo từng đơn hàng."
      />

      <Card className="p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_190px_170px_210px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Tìm mã ticket, tiêu đề..."
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">Mọi trạng thái</option>
            {statusOptions.map(([value, item]) => (
              <option key={value} value={value}>{item.label}</option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={filters.priority}
            onChange={(event) => updateFilter("priority", event.target.value)}
          >
            <option value="">Mọi ưu tiên</option>
            {priorityOptions.map(([value, item]) => (
              <option key={value} value={value}>{item.label}</option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={filters.assignee}
            onChange={(event) => updateFilter("assignee", event.target.value)}
          >
            <option value="">Mọi người phụ trách</option>
            <option value="unassigned">Chưa phân công</option>
            {(agentsQuery.data || []).map((agent) => (
              <option key={agent._id} value={agent._id}>{agent.name}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">Danh sách ticket</h2>
            <p className="text-xs text-muted-foreground">
              {pagination.total} yêu cầu phù hợp
            </p>
          </div>
          <Headphones className="size-5 text-muted-foreground" />
        </div>

        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="p-6 text-center text-sm text-danger-strong">
            {listQuery.error.message || "Không thể tải hàng đợi hỗ trợ"}
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={Headphones}
            title="Không có ticket"
            description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Ticket</th>
                  <th className="px-4 py-3 font-semibold">Khách hàng / đơn hàng</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold">Ưu tiên</th>
                  <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                  <th className="px-4 py-3 font-semibold">SLA hiện tại</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket) => {
                  const status = TICKET_STATUS[ticket.status] || TICKET_STATUS.OPEN;
                  const priority =
                    TICKET_PRIORITY[ticket.priority] || TICKET_PRIORITY.NORMAL;
                  const responsePending = !ticket.firstRespondedAt;
                  const breached = responsePending
                    ? ticket.sla?.responseBreached
                    : ticket.sla?.resolutionBreached;
                  const deadline = responsePending
                    ? ticket.responseDueAt
                    : ticket.effectiveResolutionDueAt || ticket.resolutionDueAt;
                  const paused = !responsePending && ticket.sla?.paused;
                  const completed = responsePending
                    ? ticket.firstRespondedAt
                    : ticket.resolvedAt;
                  return (
                    <tr
                      key={ticket._id}
                      tabIndex={0}
                      role="button"
                      onClick={() => navigate(`/admin/support/${ticket._id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          navigate(`/admin/support/${ticket._id}`);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                    >
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs text-muted-foreground">
                          {ticket.ticketCode}
                        </p>
                        <p className="mt-1 max-w-[260px] truncate font-semibold text-foreground">
                          {ticket.subject}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTimeVN(ticket.createdAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">{ticket.user?.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ticket.order?.orderCode} · {ticket.categoryLabel}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={status.className}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <span className={priority.className}>{priority.label}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-foreground">
                          <UserRound className="size-4 text-muted-foreground" />
                          {ticket.assignee?.name || "Chưa phân công"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={
                            breached ? "text-danger-strong" : "text-muted-foreground"
                          }
                        >
                          {breached ? (
                            <AlertTriangle className="mr-1 inline size-4" />
                          ) : (
                            <Clock className="mr-1 inline size-4" />
                          )}
                          {formatSla(deadline, completed, breached, paused)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <ChevronRight className="size-5 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Trang {pagination.page}/{pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" /> Trước
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pagination.totalPages}
                onClick={() =>
                  setPage((current) => Math.min(pagination.totalPages, current + 1))
                }
              >
                Sau <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
