import { useMemo, useState } from "react";
import { History, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatCard } from "@/components/admin/common/StatCard";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
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
import {
  useStockLedger,
  useStockValuation,
} from "@/features/admin/inventory/hooks";
import {
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_OPTIONS,
  movementLabel,
} from "@/features/admin/inventory/constants";
import { StockAdjustDialog } from "./StockAdjustDialog";
import { formatDateTimeVN, formatVND } from "@/utils/format";
import { cn } from "@/lib/utils";

// The `success` badge is a retail gradient meant for storefront chips; a ledger
// table needs the quieter tinted variants.
const BADGE_VARIANTS = {
  success: "info",
  info: "info",
  warning: "warning",
  danger: "destructive",
  default: "outline",
};

export default function StockLedgerPage() {
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const ledgerQ = useStockLedger({
    ...(type !== "all" ? { type } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });
  const valuationQ = useStockValuation();

  const data = useMemo(() => ledgerQ.data?.entries || [], [ledgerQ.data]);
  const valuation = valuationQ.data?.valuation;

  const columns = [
    {
      id: "time",
      header: "Thời gian",
      cell: ({ row }) => (
        <p className="text-xs text-muted-foreground">
          {formatDateTimeVN(row.original.createdAt)}
        </p>
      ),
    },
    {
      id: "book",
      header: "Sách",
      cell: ({ row }) => {
        const book = row.original.book;
        return (
          <div className="flex items-center gap-2">
            {book?.imageUrl && (
              <img src={book.imageUrl} alt="" className="size-9 rounded object-cover" />
            )}
            <p className="max-w-[220px] text-sm font-medium text-foreground line-clamp-1">
              {book?.title || "Sách đã xoá"}
            </p>
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Loại",
      cell: ({ row }) => {
        const meta = MOVEMENT_TYPES[row.original.type];
        return (
          <Badge variant={BADGE_VARIANTS[meta?.tone] || "outline"}>
            {movementLabel(row.original.type)}
          </Badge>
        );
      },
    },
    {
      id: "quantity",
      header: "Thay đổi",
      cell: ({ row }) => (
        <p
          className={cn(
            "font-semibold tabular-nums",
            row.original.quantity > 0 ? "text-success-strong" : "text-danger-strong"
          )}
        >
          {row.original.quantity > 0 ? "+" : ""}
          {row.original.quantity}
        </p>
      ),
    },
    {
      id: "stock",
      header: "Tồn sau",
      cell: ({ row }) => (
        <p className="text-sm tabular-nums text-foreground">
          {row.original.stockBefore} → <strong>{row.original.stockAfter}</strong>
        </p>
      ),
    },
    {
      id: "ref",
      header: "Chứng từ",
      cell: ({ row }) => (
        <div className="text-xs">
          <p className="font-mono text-foreground">{row.original.refCode || "—"}</p>
          <p className="max-w-[200px] text-muted-foreground line-clamp-2">
            {row.original.reason || "—"}
          </p>
        </div>
      ),
    },
    {
      id: "by",
      header: "Người thực hiện",
      cell: ({ row }) => (
        <p className="text-xs text-muted-foreground">
          {row.original.performedBy?.name || "Hệ thống"}
        </p>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
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
          <SelectItem value="all">Tất cả biến động</SelectItem>
          {MOVEMENT_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Label htmlFor="from" className="text-xs text-muted-foreground">
          Từ
        </Label>
        <Input
          id="from"
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
          className="h-9 w-40"
        />
        <Label htmlFor="to" className="text-xs text-muted-foreground">
          Đến
        </Label>
        <Input
          id="to"
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
          className="h-9 w-40"
        />
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch sử tồn kho"
        description="Mọi biến động tồn kho đều được ghi lại và không thể sửa"
        actions={
          <PermissionGate permission="inventory.adjust">
            <Button onClick={() => setAdjustOpen(true)}>
              <Plus className="size-4" />
              Điều chỉnh tồn
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng tồn kho"
          value={(valuation?.totalUnits ?? 0).toLocaleString("vi-VN")}
          accent="blue"
          footer={
            valuation?.reservedUnits
              ? `cuốn · ${(valuation.sellableUnits ?? 0).toLocaleString("vi-VN")} bán được, ${valuation.reservedUnits.toLocaleString("vi-VN")} giữ cho đơn`
              : "cuốn"
          }
        />
        <StatCard
          title="Giá trị theo giá vốn"
          value={formatVND(valuation?.costValue ?? 0)}
          accent="primary"
          footer={
            valuation?.booksWithoutCost
              ? `${valuation.booksWithoutCost} sách chưa có giá vốn`
              : "đã đủ giá vốn"
          }
        />
        <StatCard
          title="Giá trị theo giá bán"
          value={formatVND(valuation?.retailValue ?? 0)}
          accent="green"
        />
        <StatCard
          title="Cảnh báo tồn thấp"
          value={valuationQ.data?.lowStockCount ?? 0}
          accent={valuationQ.data?.lowStockCount ? "amber" : "green"}
          footer="đầu sách"
        />
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={ledgerQ.isLoading}
        isError={ledgerQ.isError}
        onRetry={() => ledgerQ.refetch()}
        toolbar={toolbar}
        totalLabel="biến động"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={ledgerQ.data?.pagination?.totalPages || 0}
        totalRows={ledgerQ.data?.pagination?.total || 0}
        getRowId={(row) => row._id}
        emptyState={
          <EmptyState
            icon={History}
            title="Chưa có biến động tồn kho"
            description="Các lần nhập, xuất, bán hàng và kiểm kho sẽ hiển thị ở đây."
          />
        }
      />

      <StockAdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} />
    </div>
  );
}
