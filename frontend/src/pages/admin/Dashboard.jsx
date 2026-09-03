import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Users,
  Activity,
  PieChart as PieIcon,
  LineChart as LineIcon,
  Flame,
  Clock,
  Filter,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { StatCard } from "@/components/admin/common/StatCard";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { ErrorState } from "@/components/admin/common/ErrorState";
import { RevenueAreaChart } from "@/components/admin/charts/RevenueAreaChart";
import { CategoryPieChart } from "@/components/admin/charts/CategoryPieChart";
import { RecentOrders } from "@/components/admin/dashboard/RecentOrders";
import { TopBooks } from "@/components/admin/dashboard/TopBooks";
import { ActivityFeed } from "@/components/admin/dashboard/ActivityFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";
import { formatVND } from "@/utils/format";
import {
  useActivityFeed,
  useCategoryShare,
  useDashboardStats,
  useRecentOrders,
  useRevenueSeries,
  useTopBooks,
} from "@/features/admin/dashboard/hooks";

const RANGE_OPTIONS = [
  { value: 7, label: "7 ngày qua" },
  { value: 30, label: "30 ngày qua" },
  { value: 90, label: "90 ngày qua" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState(30);

  // Only admin and accounting see money: /admin/stats omits the financial
  // fields for everyone else and the analytics endpoints refuse them, so those
  // queries stay disabled rather than 403.
  const showFinancials = can(user, "analytics.view");
  const showOrders = can(user, "order.read");

  const statsQ = useDashboardStats();
  const ordersQ = useRecentOrders(6, { enabled: showOrders });
  const topBooksQ = useTopBooks(5);
  const seriesQ = useRevenueSeries(range, { enabled: showFinancials });
  const shareQ = useCategoryShare({ enabled: showFinancials });
  const activityQ = useActivityFeed({ enabled: showFinancials });

  const stats = statsQ.data;
  const mom = stats?.monthOverMonth || {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description="Chào mừng trở lại — đây là tình hình cửa hàng hôm nay."
        actions={
          <div className="flex items-center gap-2">
            {showFinancials && (
              <Select value={String(range)} onValueChange={(v) => setRange(Number(v))}>
                <SelectTrigger className="h-9 w-[160px]">
                  <Filter className="size-4 text-muted-foreground/70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {can(user, "book.write") && (
              <Button asChild>
                <Link to="/admin/books/new">Thêm sách mới</Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))
        ) : (
          <>
            {showFinancials && (
              <StatCard
                title="Doanh thu"
                value={formatVND(stats?.orders?.totalRevenue || 0)}
                delta={mom.revenue ?? 0}
                icon={DollarSign}
                accent="green"
                footer={`${stats?.orders?.totalOrders || 0} đơn hàng`}
              />
            )}
            <StatCard
              title="Đơn hàng"
              value={stats?.orders?.totalOrders || 0}
              delta={mom.orders ?? 0}
              icon={ShoppingCart}
              accent="primary"
              footer={`${stats?.orders?.statusCounts?.PENDING || 0} chờ xử lý`}
            />
            <StatCard
              title="Người dùng"
              value={stats?.users || 0}
              delta={mom.users ?? 0}
              icon={Users}
              accent="violet"
              footer="tổng tài khoản"
            />
            <StatCard
              title="Sách đã bán"
              value={stats?.books?.totalSold || 0}
              delta={mom.soldBooks ?? 0}
              icon={TrendingUp}
              accent="amber"
              footer={`${stats?.books?.totalStock || 0} còn trong kho`}
            />
          </>
        )}
      </div>

      {showFinancials && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <SectionCard
            title="Doanh thu"
            description={`Biểu đồ doanh thu ${range} ngày qua`}
            icon={LineIcon}
            className="xl:col-span-2"
          >
            {seriesQ.isError ? (
              <ErrorState onRetry={() => seriesQ.refetch()} />
            ) : seriesQ.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <RevenueAreaChart data={seriesQ.data || []} />
            )}
          </SectionCard>

          <SectionCard title="Theo danh mục" description="Tỉ trọng doanh thu" icon={PieIcon}>
            {shareQ.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <CategoryPieChart data={shareQ.data || []} />
            )}
          </SectionCard>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {showOrders && (
          <SectionCard
            title="Đơn hàng gần đây"
            icon={Clock}
            action={
              <Link to="/admin/orders" className="text-xs font-semibold text-primary hover:underline">
                Xem tất cả
              </Link>
            }
            className="xl:col-span-2"
          >
            {ordersQ.isError ? (
              <ErrorState onRetry={() => ordersQ.refetch()} />
            ) : (
              <RecentOrders orders={ordersQ.data || []} isLoading={ordersQ.isLoading} />
            )}
          </SectionCard>
        )}

        <SectionCard
          title="Sách bán chạy"
          icon={Flame}
          action={
            <Link to="/admin/books" className="text-xs font-semibold text-primary hover:underline">
              Xem tất cả
            </Link>
          }
        >
          <TopBooks books={topBooksQ.data || []} isLoading={topBooksQ.isLoading} />
        </SectionCard>
      </div>

      {showFinancials && (
        <SectionCard title="Hoạt động" icon={Activity}>
          <ActivityFeed items={activityQ.data || []} isLoading={activityQ.isLoading} />
        </SectionCard>
      )}
    </div>
  );
}
