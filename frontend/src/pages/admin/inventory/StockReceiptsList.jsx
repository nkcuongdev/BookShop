import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PackagePlus, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStockReceipts } from "@/features/admin/inventory/hooks";
import { RECEIPT_STATUS_OPTIONS } from "@/features/admin/inventory/constants";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatVND } from "@/utils/format";

export default function StockReceiptsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debounced = useDebounce(search, 250);

  const receiptsQ = useStockReceipts({
    ...(debounced ? { search: debounced } : {}),
    ...(status !== "all" ? { status } : {}),
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const data = useMemo(() => receiptsQ.data?.receipts || [], [receiptsQ.data]);

  const columns = [
    {
      id: "code",
      header: "Mã phiếu",
      cell: ({ row }) => (
        <div>
          <Link
            to={`/admin/inventory/receipts/${row.original._id}`}
            className="font-mono text-sm font-bold text-primary hover:underline"
          >
            {row.original.code}
          </Link>
          <p className="text-xs text-muted-foreground">
            {formatDateVN(row.original.receivedAt || row.original.createdAt)}
          </p>
        </div>
      ),
    },
    {
      id: "supplier",
      header: "Nhà cung cấp",
      cell: ({ row }) => (
        <div className="text-sm">
          <p className="font-medium text-foreground line-clamp-1">
            {row.original.supplier?.name || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.original.invoiceNumber
              ? `HĐ ${row.original.invoiceNumber}`
              : "Không có hoá đơn"}
          </p>
        </div>
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
      id: "total",
      header: "Giá trị",
      cell: ({ row }) => (
        <p className="font-semibold text-primary tabular-nums">
          {formatVND(row.original.totalAmount)}
        </p>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "createdBy",
      header: "Người tạo",
      cell: ({ row }) => (
        <p className="text-xs text-muted-foreground">
          {row.original.createdBy?.name || "—"}
        </p>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          placeholder="Tìm mã phiếu, số hoá đơn..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
          className="h-9 pl-8"
        />
      </div>
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
        title="Phiếu nhập kho"
        description={`${receiptsQ.data?.pagination?.total ?? data.length} phiếu nhập`}
        actions={
          <PermissionGate permission="inventory.write">
            <Button onClick={() => navigate("/admin/inventory/receipts/new")}>
              <Plus className="size-4" />
              Tạo phiếu nhập
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={receiptsQ.isLoading}
        isError={receiptsQ.isError}
        onRetry={() => receiptsQ.refetch()}
        toolbar={toolbar}
        totalLabel="phiếu nhập"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={receiptsQ.data?.pagination?.totalPages || 0}
        totalRows={receiptsQ.data?.pagination?.total || 0}
        getRowId={(row) => row._id}
        emptyState={
          <EmptyState
            icon={PackagePlus}
            title="Chưa có phiếu nhập"
            description="Tạo phiếu nhập để ghi nhận hàng về kho và cập nhật giá vốn."
            action={
              <PermissionGate permission="inventory.write">
                <Button onClick={() => navigate("/admin/inventory/receipts/new")}>
                  <Plus className="size-4" />
                  Tạo phiếu nhập
                </Button>
              </PermissionGate>
            }
          />
        }
      />
    </div>
  );
}
