import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PackageMinus, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStockIssues } from "@/features/admin/inventory/hooks";
import {
  ISSUE_TYPES,
  RECEIPT_STATUS_OPTIONS,
  issueTypeLabel,
} from "@/features/admin/inventory/constants";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatVND } from "@/utils/format";

export default function StockIssuesList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debounced = useDebounce(search, 250);

  const issuesQ = useStockIssues({
    ...(debounced ? { search: debounced } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(type !== "all" ? { type } : {}),
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const data = useMemo(() => issuesQ.data?.issues || [], [issuesQ.data]);

  const columns = [
    {
      id: "code",
      header: "Mã phiếu",
      cell: ({ row }) => (
        <div>
          <Link
            to={`/admin/inventory/issues/${row.original._id}`}
            className="font-mono text-sm font-bold text-primary hover:underline"
          >
            {row.original.code}
          </Link>
          <p className="text-xs text-muted-foreground">
            {formatDateVN(row.original.issuedAt || row.original.createdAt)}
          </p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Loại xuất",
      cell: ({ row }) => (
        <Badge
          variant={
            ["DAMAGED", "LOST"].includes(row.original.type) ? "destructive" : "outline"
          }
        >
          {issueTypeLabel(row.original.type)}
        </Badge>
      ),
    },
    {
      id: "reason",
      header: "Lý do",
      cell: ({ row }) => (
        <p className="max-w-[240px] text-xs text-muted-foreground line-clamp-2">
          {row.original.reason || "—"}
        </p>
      ),
    },
    {
      id: "items",
      header: "Số lượng",
      cell: ({ row }) => {
        const items = row.original.items || [];
        const units = items.reduce((total, item) => total + (item.quantity || 0), 0);
        return (
          <div className="text-sm">
            <p className="font-semibold text-foreground tabular-nums">{units}</p>
            <p className="text-xs text-muted-foreground">{items.length} đầu sách</p>
          </div>
        );
      },
    },
    {
      id: "cost",
      header: "Giá trị",
      cell: ({ row }) => (
        <p className="font-semibold tabular-nums text-danger-strong">
          {row.original.status === "CONFIRMED"
            ? formatVND(row.original.totalCost)
            : "—"}
        </p>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          placeholder="Tìm mã phiếu..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
          className="h-9 pl-8"
        />
      </div>
      <Select
        value={type}
        onValueChange={(value) => {
          setType(value);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
        }}
      >
        <SelectTrigger className="h-9 w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả loại xuất</SelectItem>
          {ISSUE_TYPES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
        }}
      >
        <SelectTrigger className="h-9 w-full sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          {RECEIPT_STATUS_OPTIONS.map((value) => (
            <SelectItem key={value} value={value}>
              {value === "DRAFT"
                ? "Nháp"
                : value === "CONFIRMED"
                  ? "Đã xác nhận"
                  : "Đã huỷ"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phiếu xuất kho"
        description={`${issuesQ.data?.pagination?.total ?? data.length} phiếu xuất`}
        actions={
          <PermissionGate permission="inventory.write">
            <Button onClick={() => navigate("/admin/inventory/issues/new")}>
              <Plus className="size-4" />
              Tạo phiếu xuất
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={issuesQ.isLoading}
        isError={issuesQ.isError}
        onRetry={() => issuesQ.refetch()}
        toolbar={toolbar}
        totalLabel="phiếu xuất"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={issuesQ.data?.pagination?.totalPages || 0}
        totalRows={issuesQ.data?.pagination?.total || 0}
        getRowId={(row) => row._id}
        emptyState={
          <EmptyState
            icon={PackageMinus}
            title="Chưa có phiếu xuất"
            description="Tạo phiếu xuất để ghi nhận hàng hỏng, hàng tặng hoặc trả nhà cung cấp."
            action={
              <PermissionGate permission="inventory.write">
                <Button onClick={() => navigate("/admin/inventory/issues/new")}>
                  <Plus className="size-4" />
                  Tạo phiếu xuất
                </Button>
              </PermissionGate>
            }
          />
        }
      />
    </div>
  );
}
