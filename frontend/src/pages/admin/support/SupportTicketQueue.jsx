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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
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
const ALL = "all";

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

      <Card className="overflow-hidden">
        <div className="px-4 pt-4">
          <DataTableToolbar>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Tìm mã ticket, tiêu đề..."
                  value={filters.search}
                  onChange={(event) => updateFilter("search", event.target.value)}
                />
              </div>
              <Select
                value={filters.status || ALL}
                onValueChange={(value) => updateFilter("status", value === ALL ? "" : value)}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
                  {statusOptions.map(([value, item]) => (
                    <SelectItem key={value} value={value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.priority || ALL}
                onValueChange={(value) => updateFilter("priority", value === ALL ? "" : value)}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Mọi ưu tiên</SelectItem>
                  {priorityOptions.map(([value, item]) => (
                    <SelectItem key={value} value={value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.assignee || ALL}
                onValueChange={(value) => updateFilter("assignee", value === ALL ? "" : value)}
              >
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Mọi người phụ trách</SelectItem>
                  <SelectItem value="unassigned">Chưa phân công</SelectItem>
                  {(agentsQuery.data || []).map((agent) => (
                    <SelectItem key={agent._id} value={agent._id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              {pagination.total} yêu cầu phù hợp
            </p>
          </DataTableToolbar>
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
