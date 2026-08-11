import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyLoyalty, useMyPointsHistory } from "@/features/loyalty/hooks";
import {
  PointsBalanceCard,
  TierProgressCard,
} from "@/components/loyalty/PointsSummaryCards";
import TierBenefitsPanel from "@/components/loyalty/TierBenefitsPanel";
import PointsHistoryList from "@/components/loyalty/PointsHistoryList";

const PAGE_SIZE = 10;

export default function ProfilePoints() {
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);

  const summary = useMyLoyalty();
  const history = useMyPointsHistory({ page, limit: PAGE_SIZE, type });

  const changeType = (next) => {
    setType(next);
    // A filter change restarts the list; keeping the old page number would
    // land the customer on an empty page of a shorter result set.
    setPage(1);
  };

  if (summary.isError) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Không tải được điểm thưởng"
        description="Vui lòng thử lại sau ít phút."
        action={
          <Button variant="outline" onClick={() => summary.refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  const data = summary.data;
  const pagination = history.data?.pagination;
  const hasMorePages = pagination ? page < pagination.totalPages : false;

  return (
    <div className="space-y-6">
      {summary.isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <PointsBalanceCard
            balance={data.balance}
            pointsDebt={data.pointsDebt}
            rate={data.program?.redeemRate}
          />
          <TierProgressCard
            tier={data.tier}
            nextTier={data.nextTier}
            spend12m={data.spend12m}
            windowDays={data.program?.tierWindowDays}
          />
        </div>
      )}

      {data?.tiers?.length > 0 && (
        <TierBenefitsPanel
          tiers={data.tiers}
          currentTierKey={data.tier?.key || ""}
        />
      )}

      <PointsHistoryList
        entries={history.data?.entries || []}
        isLoading={history.isLoading}
        type={type}
        onTypeChange={changeType}
        footer={
          pagination && pagination.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Trang {page}/{pagination.totalPages} · {pagination.total} biến động
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMorePages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          ) : null
        }
      />
    </div>
  );
}
