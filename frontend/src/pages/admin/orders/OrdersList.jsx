import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download,
  Eye,
  Package,
  RotateCw,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { DataTableToolbar } from "@/components/admin/common/DataTableToolbar";
import { DataTableColumnHeader } from "@/components/admin/common/DataTableColumnHeader";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { EmptyState } from "@/components/admin/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrders, useOrder } from "@/features/admin/orders/hooks";
import {
  ORDER_STATUSES,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/features/admin/orders/constants";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import ReturnRequestStatusBadge from "@/components/order/ReturnRequestStatusBadge";
import useDebounce from "@/hooks/useDebounce";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";
import { formatDateVN, formatOrderCode, formatVND } from "@/utils/format";
import { adminAPI } from "@/services/api";
import { toast } from "@/components/ui/sonner";

export default function OrdersList() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [returnStatus, setReturnStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const debouncedSearch = useDebounce(search, 250);

  const reportFilters = useMemo(
    () => ({
      status: status === "all" ? undefined : status,
      returnStatus: returnStatus === "all" ? undefined : returnStatus,
      paymentStatus: paymentStatus === "all" ? undefined : paymentStatus,
      paymentMethod: paymentMethod === "all" ? undefined : paymentMethod,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: debouncedSearch || undefined,
    }),
    [status, returnStatus, paymentStatus, paymentMethod, dateFrom, dateTo, debouncedSearch]
  );
  const orderParams = useMemo(
    () => ({
      ...reportFilters,
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
    }),
    [pagination, reportFilters]
  );
  const ordersQ = useOrders(orderParams);
  const orderDetailQ = useOrder(id);

  const orders = ordersQ.data?.orders || [];
  const counts = ordersQ.data?.statusCounts || { all: 0 };
  const returnCounts = ordersQ.data?.returnStatusCounts || {};
  const hasFilters = Boolean(
    status !== "all" ||
      returnStatus !== "all" ||
      paymentStatus !== "all" ||
      paymentMethod !== "all" ||
      dateFrom ||
      dateTo ||
      search
  );

  const resetPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }));

  const clearFilters = () => {
    setStatus("all");
    setReturnStatus("all");
    setPaymentStatus("all");
    setPaymentMethod("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    resetPage();
  };

  const exportCsv = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.error("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
      return;
    }
    setExporting(true);
    try {
      const { blob, filename } = await adminAPI.exportOrders(reportFilters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất báo cáo đơn hàng");
    } catch (error) {
      toast.error(error.message || "Không thể xuất báo cáo đơn hàng");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = (order) => {
    navigate(`/admin/orders/${order._id || order.id}`);
  };

  const closeDrawer = (o) => {
    if (!o) navigate("/admin/orders");
  };

  const columns = [
    {
      id: "code",
      header: "Mã đơn",
      cell: ({ row }) => {
        const o = row.original;
        const code = formatOrderCode(o);
        return (
          <span className="font-semibold text-primary">{code}</span>
        );
      },
    },
    {
      id: "customer",
      header: "Khách hàng",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {row.original.shippingAddress?.fullName || "—"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.shippingAddress?.phone || ""}
          </p>
        </div>
      ),
    },
    {
      id: "date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày đặt" />,
      accessorFn: (r) => r.createdAt,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDateVN(row.original.placedAt || row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "items",
      header: "Sản phẩm",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Package className="size-4 text-muted-foreground/70" />
          {row.original.items?.length || 0}
        </div>
      ),
    },
    {
      id: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tổng" />,
      accessorFn: (r) => r.totalAmount || 0,
      cell: ({ row }) => (
        <span className="font-semibold text-foreground">
          {formatVND(row.original.totalAmount || 0)}
        </span>
      ),
    },
    {
      id: "payment",
      header: "Thanh toán",
      cell: ({ row }) => {
        const p = row.original.payment || {};
        return (
          <div className="flex flex-col gap-1">
            <StatusBadge status={p.method || "COD"} />
            <StatusBadge status={p.status || "UNPAID"} />
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Trạng thái",
      accessorKey: "status",
      cell: ({ row }) => <StatusBadge status={row.original.status || "PENDING"} />,
    },
    {
      id: "returnRequest",
      header: "Đổi trả",
      cell: ({ row }) =>
        row.original.returnRequest ? (
          <ReturnRequestStatusBadge status={row.original.returnRequest.status} />
        ) : (
          <span className="text-muted-foreground/70">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDetail(row.original)}
          >
            <Eye className="size-4" />
            Xem
          </Button>
        </div>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder="Tìm theo mã, tên, SĐT..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="h-9 pl-8"
          />
        </div>
        <select
          aria-label="Lọc yêu cầu đổi trả"
          value={returnStatus}
          onChange={(event) => {
            setReturnStatus(event.target.value);
            resetPage();
          }}
          className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">Tất cả đổi trả</option>
          <option value="PENDING">Chờ duyệt ({returnCounts.PENDING || 0})</option>
          <option value="APPROVED">Đã duyệt ({returnCounts.APPROVED || 0})</option>
          <option value="REJECTED">Đã từ chối ({returnCounts.REJECTED || 0})</option>
        </select>
        <select
          aria-label="Lọc trạng thái thanh toán"
          value={paymentStatus}
          onChange={(event) => {
            setPaymentStatus(event.target.value);
            resetPage();
          }}
          className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">Tất cả thanh toán</option>
          {Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          aria-label="Lọc phương thức thanh toán"
          value={paymentMethod}
          onChange={(event) => {
            setPaymentMethod(event.target.value);
            resetPage();
          }}
          className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">Tất cả phương thức</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Từ ngày
          <Input
            type="date"
            aria-label="Từ ngày đặt"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              setDateFrom(event.target.value);
              resetPage();
            }}
            className="h-9 w-auto"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Đến ngày
          <Input
            type="date"
            aria-label="Đến ngày đặt"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value);
              resetPage();
            }}
            className="h-9 w-auto"
          />
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="size-4" />
            Xóa bộ lọc
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => ordersQ.refetch()}>
          <RotateCw className="size-4" />
          Tải lại
        </Button>
        {can(user, "order.export") && (
          <Button size="sm" onClick={exportCsv} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "Đang xuất..." : "Xuất CSV"}
          </Button>
        )}
      </div>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý đơn hàng"
        description={`${counts.all || 0} đơn hàng phù hợp · ${returnCounts.PENDING || 0} yêu cầu đổi trả chờ duyệt`}
      />

      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          resetPage();
        }}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="all" className="gap-2">
            Tất cả
            <span className="rounded-full bg-border px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              {counts.all}
            </span>
          </TabsTrigger>
          {ORDER_STATUSES.map((s) => (
            <TabsTrigger key={s.value} value={s.value} className="gap-2">
              {s.label}
              {counts[s.value] > 0 && (
                <span className="rounded-full bg-border px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                  {counts[s.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {ordersQ.isError ? (
        <ErrorState onRetry={() => ordersQ.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={orders}
          isLoading={ordersQ.isLoading}
          toolbar={toolbar}
          totalLabel="đơn"
          pagination={pagination}
          onPaginationChange={setPagination}
          pageCount={ordersQ.data?.pagination?.totalPages || 1}
          totalRows={ordersQ.data?.pagination?.total || 0}
          getRowId={(r) => r._id || r.id}
          onRowClick={openDetail}
          emptyState={
            <EmptyState
              icon={ShoppingCart}
              title="Không có đơn hàng"
              description="Chưa có đơn hàng nào khớp với bộ lọc."
            />
          }
        />
      )}

      <OrderDetailDrawer
        order={orderDetailQ.data || orders.find((o) => (o._id || o.id) === id)}
        open={Boolean(id)}
        onOpenChange={closeDrawer}
      />
    </div>
  );
}
