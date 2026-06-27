import { useMemo, useState } from "react";
import { ScrollText, Download, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuditLogs, useAuditLogMeta } from "@/features/admin/auditLogs/hooks";
import { categoryTone } from "@/features/admin/auditLogs/constants";
import { auditLogsAPI } from "@/services/api";
import { formatDateTimeVN } from "@/utils/format";

const ALL = "all";

/**
 * Read-only view of the admin audit trail.
 *
 * There is deliberately no action column: entries are immutable server-side,
 * so offering an edit or delete affordance would only promise something the
 * API refuses.
 */
export default function AuditLogPage() {
  const [category, setCategory] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [actor, setActor] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const metaQ = useAuditLogMeta();

  // Both the table and the CSV export read the same filter object, so the file
  // always contains exactly what the screen is showing.
  const filters = useMemo(
    () => ({
      ...(category !== ALL ? { category } : {}),
      ...(action !== ALL ? { action } : {}),
      ...(actor !== ALL ? { actor } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [category, action, actor, from, to]
  );

  const logsQ = useAuditLogs({
    ...filters,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const data = useMemo(() => logsQ.data?.items || [], [logsQ.data]);

  // Any filter change invalidates the page the user is on: staying on page 5
  // of a narrower result set would show an empty table.
  const onFilterChange = (setter) => (value) => {
    setter(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  // Narrow the action list to the selected category, so the two dropdowns
  // cannot be combined into a filter that matches nothing.
  const actionOptions = useMemo(() => {
    const actions = metaQ.data?.actions || [];
    return category === ALL
      ? actions
      : actions.filter((option) => option.category === category);
  }, [metaQ.data, category]);

  const handleCategoryChange = (value) => {
    setCategory(value);
    // The selected action may not belong to the new category any more.
    if (
      value !== ALL &&
      action !== ALL &&
      !(metaQ.data?.actions || []).some(
        (option) => option.value === action && option.category === value
      )
    ) {
      setAction(ALL);
    }
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await auditLogsAPI.exportCsv(filters);
    } catch (error) {
      toast.error(error?.message || "Không thể xuất nhật ký");
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      id: "time",
      header: "Thời gian",
      cell: ({ row }) => (
        <p className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTimeVN(row.original.createdAt)}
        </p>
      ),
    },
    {
      id: "actor",
      header: "Người thực hiện",
      cell: ({ row }) => (
        <div className="text-xs">
          <p className="font-medium text-foreground">
            {row.original.actorName || "Không rõ"}
          </p>
          <p className="text-muted-foreground">
            {row.original.actorEmail || "—"}
          </p>
        </div>
      ),
    },
    {
      id: "action",
      header: "Hành động",
      cell: ({ row }) => (
        <div className="space-y-1">
          <Badge variant={categoryTone(row.original.category)}>
            {row.original.categoryLabel}
          </Badge>
          <p className="text-xs text-foreground">{row.original.actionLabel}</p>
        </div>
      ),
    },
    {
      id: "target",
      header: "Đối tượng",
      cell: ({ row }) => (
        <p className="max-w-[200px] text-sm text-foreground line-clamp-2">
          {row.original.targetLabel || "—"}
        </p>
      ),
    },
    {
      id: "changes",
      header: "Thay đổi",
      cell: ({ row }) => {
        const changes = row.original.changes || [];
        if (!changes.length) {
          return (
            <p className="max-w-[260px] text-xs text-muted-foreground line-clamp-2">
              {row.original.reason || "—"}
            </p>
          );
        }
        return (
          <div className="space-y-1">
            {changes.map((change) => (
              <div
                key={change.field}
                className="flex flex-wrap items-center gap-1 text-xs"
              >
                <span className="text-muted-foreground">
                  {change.label || change.field}:
                </span>
                <span className="text-danger-strong line-through">
                  {change.before || "trống"}
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="font-medium text-success-strong">
                  {change.after || "trống"}
                </span>
              </div>
            ))}
            {row.original.reason && (
              <p className="max-w-[260px] text-xs italic text-muted-foreground line-clamp-2">
                {row.original.reason}
              </p>
            )}
          </div>
        );
      },
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <Select value={category} onValueChange={handleCategoryChange}>
        <SelectTrigger className="h-9 w-full sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tất cả nhóm</SelectItem>
          {(metaQ.data?.categories || []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={action} onValueChange={onFilterChange(setAction)}>
        <SelectTrigger className="h-9 w-full sm:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tất cả hành động</SelectItem>
          {actionOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={actor} onValueChange={onFilterChange(setActor)}>
        <SelectTrigger className="h-9 w-full sm:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tất cả người thực hiện</SelectItem>
          {(metaQ.data?.actors || []).map((option) => (
            <SelectItem key={option.id} value={String(option.id)}>
              {option.name || option.email || "Không rõ"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
          Từ
        </Label>
        <Input
          id="audit-from"
          type="date"
          value={from}
          onChange={(event) => onFilterChange(setFrom)(event.target.value)}
          className="h-9 w-40"
        />
        <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
          Đến
        </Label>
        <Input
          id="audit-to"
          type="date"
          value={to}
          onChange={(event) => onFilterChange(setTo)(event.target.value)}
          className="h-9 w-40"
        />
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhật ký quản trị"
        description="Ai đã sửa giá, sửa tồn, đổi trạng thái đơn, duyệt hoàn tiền hay khoá tài khoản. Bản ghi không thể sửa hoặc xoá."
        actions={
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting || !data.length}
          >
            <Download className="size-4" />
            {exporting ? "Đang xuất..." : "Xuất CSV"}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={logsQ.isLoading}
        isError={logsQ.isError}
        onRetry={() => logsQ.refetch()}
        toolbar={toolbar}
        totalLabel="thao tác"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={logsQ.data?.pagination?.totalPages || 0}
        totalRows={logsQ.data?.pagination?.total || 0}
        getRowId={(row) => row._id}
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="Chưa có thao tác nào được ghi"
            description="Các thay đổi về giá, tồn kho, trạng thái đơn, hoàn tiền và tài khoản sẽ hiển thị ở đây."
          />
        }
      />
    </div>
  );
}
