import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Eye, Package, RotateCw, Search, ShoppingCart } from "lucide-react";
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
import { ORDER_STATUSES } from "@/features/admin/orders/constants";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import useDebounce from "@/hooks/useDebounce";
import { formatDateVN, formatOrderCode, formatVND } from "@/utils/format";

export default function OrdersList() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);

  const ordersQ = useOrders();
  const orderDetailQ = useOrder(id);

  const [drawerOpen, setDrawerOpen] = useState(!!id);

  useEffect(() => {
    setDrawerOpen(!!id);
  }, [id]);

  const orders = ordersQ.data || [];

  const counts = useMemo(() => {
    const c = { all: orders.length };
    ORDER_STATUSES.forEach((s) => (c[s.value] = 0));
    orders.forEach((o) => {
      if (c[o.status] !== undefined) c[o.status]++;
    });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (status !== "all") list = list.filter((o) => o.status === status);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((o) => {
        const id = (o._id || o.id || "").toLowerCase();
        const name = (o.shippingAddress?.fullName || "").toLowerCase();
        const phone = (o.shippingAddress?.phone || "").toLowerCase();
        return id.includes(q) || name.includes(q) || phone.includes(q);
      });
    }
    return list;
  }, [orders, status, debouncedSearch]);

  const openDetail = (order) => {
    navigate(`/admin/orders/${order._id || order.id}`);
  };

  const closeDrawer = (o) => {
    setDrawerOpen(o);
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
          <span className="font-semibold text-primary-600">{code}</span>
        );
      },
    },
    {
      id: "customer",
      header: "Khách hàng",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-secondary-800">
            {row.original.shippingAddress?.fullName || "—"}
          </p>
          <p className="truncate text-xs text-secondary-500">
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
        <span className="text-secondary-600">
          {formatDateVN(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "items",
      header: "Sản phẩm",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 text-secondary-600">
          <Package className="h-3.5 w-3.5 text-secondary-400" />
          {row.original.items?.length || 0}
        </div>
      ),
    },
    {
      id: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tổng" />,
      accessorFn: (r) => r.totalAmount || 0,
      cell: ({ row }) => (
        <span className="font-semibold text-secondary-800">
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
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDetail(row.original)}
          >
            <Eye className="h-3.5 w-3.5" />
            Xem
          </Button>
        </div>
      ),
    },
  ];

  const toolbar = (
    <DataTableToolbar>
      <div className="flex flex-1 items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400" />
          <Input
            placeholder="Tìm theo mã, tên, SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => ordersQ.refetch()}>
        <RotateCw className="h-3.5 w-3.5" />
        Tải lại
      </Button>
    </DataTableToolbar>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý đơn hàng"
        description={`${orders.length} đơn hàng tổng cộng`}
      />

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="all" className="gap-2">
            Tất cả
            <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-secondary-700">
              {counts.all}
            </span>
          </TabsTrigger>
          {ORDER_STATUSES.map((s) => (
            <TabsTrigger key={s.value} value={s.value} className="gap-2">
              {s.label}
              {counts[s.value] > 0 && (
                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-secondary-700">
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
          data={filtered}
          isLoading={ordersQ.isLoading}
          toolbar={toolbar}
          totalLabel="đơn"
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
        open={drawerOpen}
        onOpenChange={closeDrawer}
      />
    </div>
  );
}
