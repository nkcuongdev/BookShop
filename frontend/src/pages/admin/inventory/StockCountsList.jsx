import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStockCounts } from "@/features/admin/inventory/hooks";
import { COUNT_STATUS_OPTIONS } from "@/features/admin/inventory/constants";
import { CreateStockCountDialog } from "./CreateStockCountDialog";
import { formatDateVN, formatVND } from "@/utils/format";

const STATUS_LABELS = {
  COUNTING: "Đang kiểm",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã huỷ",
};

export default function StockCountsList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const countsQ = useStockCounts({
    ...(status !== "all" ? { status } : {}),
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const data = useMemo(() => countsQ.data?.counts || [], [countsQ.data]);

  const columns = [
    {
      id: "code",
      header: "Mã phiếu",
      cell: ({ row }) => (
        <div>
          <Link
            to={`/admin/inventory/counts/${row.original._id}`}
            className="font-mono text-sm font-bold text-primary hover:underline"
          >
            {row.original.code}
          </Link>
          <p className="text-xs text-muted-foreground">
            {formatDateVN(row.original.createdAt)}
          </p>
        </div>
      ),
    },
    {
      id: "scope",
      header: "Phạm vi",
      cell: ({ row }) => (
        <p className="text-sm text-foreground">
          {row.original.scope === "ALL"
            ? "Toàn bộ kho"
            : row.original.scope === "CATEGORY"
              ? `Danh mục: ${row.original.scopeValue}`
              : "Tuỳ chọn"}
        </p>
      ),
    },
    {
      id: "progress",
      header: "Tiến độ",
      cell: ({ row }) => (
        <p className="text-sm tabular-nums text-foreground">
          {row.original.countedLines}
          <span className="text-muted-foreground"> dòng đã đếm</span>
        </p>
      ),
    },
    {
      id: "difference",
      header: "Chênh lệch",
      cell: ({ row }) => {
        const count = row.original;
        if (!count.diffLines) {
          return <span className="text-sm text-muted-foreground">Không lệch</span>;
        }
        const isLoss = count.totalValueDifference < 0;
        return (
          <div className="text-sm">
            <p
              className={
                isLoss
                  ? "font-semibold tabular-nums text-danger-strong"
                  : "font-semibold tabular-nums text-success-strong"
              }
            >
              {count.totalDifference > 0 ? "+" : ""}
              {count.totalDifference} cuốn
            </p>
            <p className="text-xs text-muted-foreground">
              {formatVND(Math.abs(count.totalValueDifference))} · {count.diffLines} dòng
            </p>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "completedBy",
      header: "Người thực hiện",
      cell: ({ row }) => (
        <p className="text-xs text-muted-foreground">
          {row.original.completedBy?.name || row.original.createdBy?.name || "—"}
        </p>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
        }}
      >
        <SelectTrigger className="h-9 w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          {COUNT_STATUS_OPTIONS.map((value) => (
            <SelectItem key={value} value={value}>
              {STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiểm kho"
        description={`${countsQ.data?.pagination?.total ?? data.length} phiếu kiểm kho`}
        actions={
          <PermissionGate permission="inventory.write">
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Tạo phiếu kiểm kho
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={countsQ.isLoading}
        isError={countsQ.isError}
        onRetry={() => countsQ.refetch()}
        toolbar={toolbar}
        totalLabel="phiếu kiểm kho"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={countsQ.data?.pagination?.totalPages || 0}
        totalRows={countsQ.data?.pagination?.total || 0}
        getRowId={(row) => row._id}
        emptyState={
          <EmptyState
            icon={ClipboardCheck}
            title="Chưa có phiếu kiểm kho"
            description="Tạo phiếu kiểm kho để đối chiếu tồn thực tế với sổ sách."
            action={
              <PermissionGate permission="inventory.write">
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" />
                  Tạo phiếu kiểm kho
                </Button>
              </PermissionGate>
            }
          />
        }
      />

      <CreateStockCountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(count) => navigate(`/admin/inventory/counts/${count._id}`)}
      />
    </div>
  );
}
