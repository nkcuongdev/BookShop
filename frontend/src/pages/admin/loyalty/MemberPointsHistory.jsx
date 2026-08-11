import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Settings2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTable } from "@/components/admin/common/DataTable";
import { StatCard } from "@/components/admin/common/StatCard";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TierBadge from "@/components/loyalty/TierBadge";
import PointsAdjustDialog from "./PointsAdjustDialog";
import { useLoyaltyMember } from "@/features/admin/loyalty/hooks";
import { formatDateTimeVN, formatVND } from "@/utils/format";
import { pointEntryLabel } from "@/utils/loyalty";

export default function MemberPointsHistory() {
  const { userId } = useParams();
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [adjusting, setAdjusting] = useState(null);

  const query = useLoyaltyMember(userId, {
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const user = query.data?.user;
  const loyalty = query.data?.loyalty;
  const history = query.data?.history;

  const columns = [
    {
      id: "createdAt",
      header: "Thời gian",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTimeVN(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "type",
      header: "Loại",
      cell: ({ row }) => (
        <Badge variant="outline">{pointEntryLabel(row.original.type)}</Badge>
      ),
    },
    {
      id: "points",
      header: "Thay đổi",
      cell: ({ row }) => {
        const positive = row.original.points > 0;
        return (
          <span
            className={
              positive
                ? "font-semibold tabular-nums text-success-strong"
                : "font-semibold tabular-nums text-danger-strong"
            }
          >
            {positive ? "+" : "−"}
            {Math.abs(row.original.points).toLocaleString("vi-VN")}
          </span>
        );
      },
    },
    {
      id: "balanceAfter",
      header: "Số dư sau",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.balanceAfter.toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      id: "reason",
      header: "Mô tả",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.reason || "—"}</span>
      ),
    },
    {
      id: "performedBy",
      header: "Người thực hiện",
      cell: ({ row }) => (
        // An audit trail that cannot say who did something is not much of one.
        <span className="text-xs text-muted-foreground">
          {row.original.performedByName || "Hệ thống"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user?.name || "Khách hàng"}
            {loyalty?.tierKey && (
              <TierBadge tier={loyalty.tierKey} label={loyalty.tierLabel} />
            )}
          </span>
        }
        description={user?.email}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/loyalty/members">
                <ArrowLeft className="size-4" />
                Danh sách
              </Link>
            </Button>
            <PermissionGate permission="loyalty.adjust">
              <Button
                onClick={() =>
                  setAdjusting({
                    id: userId,
                    name: user?.name,
                    pointsBalance: loyalty?.pointsBalance || 0,
                  })
                }
              >
                <Settings2 className="size-4" />
                Điều chỉnh điểm
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Sparkles}
          accent="amber"
          title="Số dư điểm"
          value={(loyalty?.pointsBalance ?? 0).toLocaleString("vi-VN")}
        />
        <StatCard
          icon={TrendingUp}
          accent="green"
          title="Tổng đã tích"
          value={(loyalty?.lifetimeEarned ?? 0).toLocaleString("vi-VN")}
        />
        <StatCard
          icon={TrendingDown}
          accent="rose"
          title="Tổng đã tiêu"
          value={(loyalty?.lifetimeRedeemed ?? 0).toLocaleString("vi-VN")}
        />
        <StatCard
          icon={TrendingUp}
          accent="blue"
          title="Chi tiêu 12 tháng"
          value={formatVND(loyalty?.spend12m ?? 0)}
        />
        <StatCard
          icon={AlertTriangle}
          accent="rose"
          title="Nợ điểm chờ bù"
          value={(loyalty?.pointsDebt ?? 0).toLocaleString("vi-VN")}
          footer="Tự bù vào điểm tích trong tương lai"
        />
      </div>

      <DataTable
        columns={columns}
        data={history?.entries || []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(row) => row.id}
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={history?.pagination?.totalPages || 0}
        totalRows={history?.pagination?.total || 0}
        totalLabel="biến động"
      />

      <PointsAdjustDialog
        member={adjusting}
        open={Boolean(adjusting)}
        onOpenChange={(open) => !open && setAdjusting(null)}
      />
    </div>
  );
}
