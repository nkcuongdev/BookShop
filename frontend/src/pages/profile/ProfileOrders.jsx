import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Package, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/common/EmptyState";
import OrderStatusBadge from "@/components/order/OrderStatusBadge";
import { ordersAPI } from "@/services/api";
import { formatVND, formatDateVN, formatOrderCode } from "@/utils/format.js";

const FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "PENDING", label: "Chờ thanh toán" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "PROCESSING", label: "Đang xử lý" },
  { value: "SHIPPED", label: "Đang giao" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "REFUNDING", label: "Hoàn tiền" },
];

function OrderRow({ order, onSelect }) {
  const orderId = order._id || order.id;
  const code = formatOrderCode(order);
  const total = order.totalAmount || order.total || 0;
  const items = order.items || [];

  return (
    <Card
      onClick={() => onSelect(orderId)}
      className="p-4 sm:p-5 hover:shadow-md hover:border-primary-200 transition-all cursor-pointer group"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-semibold text-secondary-800 group-hover:text-primary-600 transition-colors font-mono text-sm">
              {code}
            </h3>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-secondary-500">
            {formatDateVN(order.placedAt || order.createdAt)} · {items.length}{" "}
            sản phẩm
          </p>
        </div>
        <p className="text-lg font-bold text-primary-600 sm:text-right">
          {formatVND(total)}
        </p>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
        <div className="flex -space-x-2">
          {items.slice(0, 4).map((item, idx) => (
            <img
              key={idx}
              src={item.imageUrl || "https://via.placeholder.com/40"}
              alt={item.title}
              className="w-9 h-9 object-cover rounded-lg border-2 border-white shadow-sm"
            />
          ))}
        </div>
        {items.length > 4 && (
          <span className="text-xs text-secondary-500">
            +{items.length - 4} sản phẩm
          </span>
        )}
      </div>
    </Card>
  );
}

export default function ProfileOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await ordersAPI.getMyOrders();
        if (res.success) setOrders(res.data.orders);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = orders;
    if (filter !== "all") list = list.filter((o) => o.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((o) => {
        const id = (o._id || o.id || "").toLowerCase();
        const code = (o.orderCode || "").toLowerCase();
        return (
          id.includes(q) ||
          code.includes(q) ||
          o.items?.some((item) => item.title?.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [orders, filter, query]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-lg font-display font-bold text-secondary-800">
          Đơn hàng của tôi
        </h2>
        <p className="text-sm text-secondary-500">{orders.length} đơn hàng</p>

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã đơn, tên sách..."
              className="pl-9"
            />
          </div>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="mt-4">
          <TabsList className="w-full overflow-x-auto no-scrollbar justify-start">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="shrink-0">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Package}
            title={orders.length === 0 ? "Chưa có đơn hàng" : "Không có kết quả"}
            description={
              orders.length === 0
                ? "Khi bạn đặt hàng, đơn hàng sẽ xuất hiện ở đây."
                : "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
            }
            action={
              orders.length === 0 ? (
                <Button asChild>
                  <Link to="/products">Bắt đầu mua sắm</Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <OrderRow
              key={o._id || o.id}
              order={o}
              onSelect={(id) => navigate(`/profile/orders/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
