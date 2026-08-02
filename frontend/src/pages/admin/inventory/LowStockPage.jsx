import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, PackagePlus, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useLowStock } from "@/features/admin/inventory/hooks";
import {
  SEVERITY_STATUS,
  stockSeverity,
} from "@/features/admin/inventory/constants";
import { StockAdjustDialog } from "./StockAdjustDialog";
import { formatVND } from "@/utils/format";

export default function LowStockPage() {
  const navigate = useNavigate();
  const [includeOutOfStock, setIncludeOutOfStock] = useState(true);
  const [adjustBook, setAdjustBook] = useState(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const lowStockQ = useLowStock({
    includeOutOfStock: includeOutOfStock ? undefined : "false",
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const data = useMemo(() => lowStockQ.data?.books || [], [lowStockQ.data]);

  const columns = [
    {
      id: "book",
      header: "Sách",
      cell: ({ row }) => {
        const book = row.original;
        return (
          <div className="flex items-center gap-2">
            {book.imageUrl && (
              <img src={book.imageUrl} alt="" className="size-10 rounded object-cover" />
            )}
            <div className="min-w-0">
              <Link
                to={`/admin/books/${book._id}/edit`}
                className="line-clamp-1 text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {book.title}
              </Link>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {book.author}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "stock",
      header: "Tồn kho",
      cell: ({ row }) => {
        const book = row.original;
        return (
          <div className="text-sm">
            <p className="font-bold tabular-nums text-foreground">{book.stock}</p>
            <p className="text-xs text-muted-foreground">
              Ngưỡng: {book.effectiveReorderPoint}
            </p>
          </div>
        );
      },
    },
    {
      id: "severity",
      header: "Mức độ",
      cell: ({ row }) => (
        <StatusBadge status={SEVERITY_STATUS[stockSeverity(row.original)]} />
      ),
    },
    {
      id: "suggestion",
      header: "Đề nghị nhập",
      cell: ({ row }) => (
        <p className="text-sm font-semibold tabular-nums text-primary">
          {row.original.suggestedQuantity} cuốn
        </p>
      ),
    },
    {
      id: "supplier",
      header: "Nhà cung cấp",
      cell: ({ row }) => {
        const supplier = row.original.defaultSupplier;
        return (
          <div className="text-xs">
            <p className="text-foreground line-clamp-1">
              {supplier?.name || "Chưa gán"}
            </p>
            {supplier?.leadTimeDays > 0 && (
              <p className="text-muted-foreground">
                Giao ~{supplier.leadTimeDays} ngày
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "cost",
      header: "Giá vốn",
      cell: ({ row }) => (
        <p className="text-sm tabular-nums text-muted-foreground">
          {row.original.costPrice > 0 ? formatVND(row.original.costPrice) : "—"}
        </p>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <PermissionGate permission="inventory.adjust">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Điều chỉnh tồn ${row.original.title}`}
              onClick={() => setAdjustBook(row.original)}
            >
              <Settings2 className="size-4" />
            </Button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="flex items-center gap-2">
        <Checkbox
          id="includeOutOfStock"
          checked={includeOutOfStock}
          onCheckedChange={(checked) => {
            setIncludeOutOfStock(Boolean(checked));
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
        <Label htmlFor="includeOutOfStock" className="text-sm font-normal">
          Bao gồm sách đã hết hàng
        </Label>
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sắp hết hàng"
        description={`${
          lowStockQ.data?.pagination?.total ?? data.length
        } đầu sách ở dưới ngưỡng tồn tối thiểu`}
        actions={
          <PermissionGate permission="inventory.write">
            <Button onClick={() => navigate("/admin/inventory/receipts/new")}>
              <PackagePlus className="size-4" />
              Tạo phiếu nhập
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        isLoading={lowStockQ.isLoading}
        isError={lowStockQ.isError}
        onRetry={() => lowStockQ.refetch()}
        toolbar={toolbar}
        totalLabel="đầu sách"
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={lowStockQ.data?.pagination?.totalPages || 0}
        totalRows={lowStockQ.data?.pagination?.total || 0}
        getRowId={(row) => row._id}
        emptyState={
          <EmptyState
            icon={AlertTriangle}
            title="Không có sách nào sắp hết"
            description="Mọi đầu sách đang trên ngưỡng tồn tối thiểu."
          />
        }
      />

      <StockAdjustDialog
        open={Boolean(adjustBook)}
        onOpenChange={(open) => {
          if (!open) setAdjustBook(null);
        }}
        book={adjustBook}
      />
    </div>
  );
}
