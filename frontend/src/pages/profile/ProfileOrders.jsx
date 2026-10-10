import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CreditCard, Package, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/common/EmptyState";
import OrderStatusBadge from "@/components/order/OrderStatusBadge";
import { ordersAPI } from "@/services/api";
import { formatVND, formatDateVN, formatOrderCode } from "@/utils/format.js";
import useDebounce from "@/hooks/useDebounce";
import BookCover from "@/components/book/BookCover";

const FILTERS = [
  { value: "all", label: "Tất cả" },
  // PENDING gồm cả COD chờ cửa hàng xác nhận, không chỉ đơn online chờ trả tiền.
  { value: "PENDING", label: "Chờ xử lý" },
  // PAID là đơn online đã trả và đang chờ cửa hàng xác nhận, không phải
  // "mọi đơn đã trả tiền" (đơn COD đã giao cũng là đã trả).
  { value: "PAID", label: "Chờ xác nhận" },
  { value: "PROCESSING", label: "Đang xử lý" },
  { value: "CANCELLING", label: "Đang hủy đơn" },
  { value: "SHIPPED", label: "Đang giao" },
  { value: "DELIVERED", label: "Đã giao" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "FAILED", label: "Thanh toán thất bại" },
  // Cả đang hoàn và đã hoàn; trước đây đơn REFUNDED không thuộc tab nào.
  { value: "REFUNDING,REFUNDED", label: "Hoàn tiền" },
];

const countFor = (statusCounts, value) =>
  value === "all"
    ? Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
    : value.split(",").reduce((sum, status) => sum + (statusCounts[status] || 0), 0);

// 1: PENDING trộn hai việc rất khác nhau với khách.
function paymentHint(order) {
  const method = order.payment?.method;
  if (order.status !== "PENDING") return null;
  if (method === "COD") return { text: "Chờ cửa hàng xác nhận đơn COD", canPay: false };
  if (order.payment?.status === "UNPAID") {
    return {
      text: `Chưa thanh toán · ${method === "MOMO" ? "MoMo" : method || "online"}`,
      canPay: true,
    };
  }
  return null;
}

function OrderRow({ order, onSelect }) {
  const orderId = order._id || order.id;
  const code = formatOrderCode(order);
  const total = order.totalAmount || order.total || 0;
  const items = order.itemsPreview || order.items || [];
  const itemCount = order.itemCount ?? items.length;
  const hint = paymentHint(order);
  const [paying, setPaying] = useState(false);

  // Same retry flow as the order detail's "Thanh toán ngay".
  const pay = async (event) => {
    event.stopPropagation();
    setPaying(true);
    try {
      const res = await ordersAPI.retryPayment(orderId);
      const url = res?.data?.paymentUrl;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("Không lấy được liên kết thanh toán");
    } catch (err) {
      toast.error(err.message || "Không thể thanh toán lúc này");
    } finally {
      setPaying(false);
    }
  };

  return (
    <Card
      interactive
      onClick={() => onSelect(orderId)}
      className="group cursor-pointer p-4 sm:p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors font-mono text-sm">
              {code}
            </h3>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateVN(order.placedAt || order.createdAt)} · {itemCount}{" "}
            sản phẩm
          </p>
        </div>
        <p className="text-lg font-bold text-primary sm:text-right">
          {formatVND(total)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border">
        <div className="flex shrink-0 -space-x-2">
          {items.slice(0, 4).map((item, idx) => (
            <BookCover
              key={idx}
              src={item.imageUrl}
              title={item.title}
              size="xs"
              className="border-2 border-card shadow-xs"
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {items[0]?.title || "Sản phẩm"}
          </p>
          {itemCount > 1 && (
            <p className="text-xs text-muted-foreground">+{itemCount - 1} sách khác</p>
          )}
        </div>
        {hint && (
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium ${
                hint.canPay ? "text-warning-strong" : "text-muted-foreground"
              }`}
            >
              {hint.text}
            </span>
            {hint.canPay && (
              <Button size="sm" onClick={pay} disabled={paying}>
                <CreditCard className="size-4" />
                Thanh toán ngay
              </Button>
            )}
          </div>
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [statusCounts, setStatusCounts] = useState({});
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const debouncedQuery = useDebounce(query, 250);
  const tabsListRef = useRef(null);

  useEffect(() => {
    tabsListRef.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [filter]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await ordersAPI.getMyOrders({
          page,
          limit: 10,
          status: filter === "all" ? undefined : filter,
          search: debouncedQuery.trim() || undefined,
        });
        if (active && res.success) {
          setOrders(res.data.orders || []);
          setPagination(res.data.pagination || { total: 0, page: 1, totalPages: 1 });
          setStatusCounts(res.data.statusCounts || {});
          setLoadError(false);
        }
      } catch (e) {
        console.error(e);
        // Một lỗi tải không có nghĩa là khách chưa có đơn nào.
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [page, filter, debouncedQuery, reloadKey]);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-h3 font-display font-bold text-foreground">
          Đơn hàng của tôi
        </h2>
        <p className="text-sm text-muted-foreground">
          {countFor(statusCounts, "all")} đơn hàng
        </p>

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm mã đơn, tên sách..."
              className="pl-9"
            />
          </div>
        </div>

        <Tabs
          value={filter}
          onValueChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          className="mt-4"
        >
          <TabsList
            ref={tabsListRef}
            className="w-full overflow-x-auto no-scrollbar justify-start"
          >
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="shrink-0 gap-1.5 px-3">
                {f.label}
                {countFor(statusCounts, f.value) > 0 && (
                  <span className="rounded-full bg-border px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                    {countFor(statusCounts, f.value)}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <Card className="p-6">
          <EmptyState
            icon={Package}
            title="Không tải được danh sách đơn hàng"
            description="Đã có lỗi khi tải đơn hàng của bạn. Vui lòng thử lại."
            action={
              <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                Thử lại
              </Button>
            }
          />
        </Card>
      ) : orders.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Package}
            title={pagination.total === 0 && filter === "all" && !debouncedQuery ? "Chưa có đơn hàng" : "Không có kết quả"}
            description={
              pagination.total === 0 && filter === "all" && !debouncedQuery
                ? "Khi bạn đặt hàng, đơn hàng sẽ xuất hiện ở đây."
                : "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
            }
            action={
              pagination.total === 0 && filter === "all" && !debouncedQuery ? (
                <Button asChild>
                  <Link to="/products">Bắt đầu mua sắm</Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <OrderRow
              key={o._id || o.id}
              order={o}
              onSelect={(id) => navigate(`/profile/orders/${id}`)}
            />
          ))}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Trang trước
              </Button>
              <span className="text-sm text-muted-foreground">
                Trang {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= pagination.totalPages || loading}
                onClick={() =>
                  setPage((current) => Math.min(pagination.totalPages, current + 1))
                }
              >
                Trang sau
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
