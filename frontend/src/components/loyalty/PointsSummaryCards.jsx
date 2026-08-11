import { Gift, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVND } from "@/utils/format";
import { pointsToVnd } from "@/utils/loyalty";
import TierBadge from "./TierBadge";

export function PointsSummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

/** Balance, plus what it is worth and where to spend it. */
export function PointsBalanceCard({ balance = 0, pointsDebt = 0, rate }) {
  return (
    <Card className="flex flex-col justify-between p-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="size-4 text-warning-strong" />
          Điểm thưởng của bạn
        </div>
        <div className="mt-3 text-4xl font-bold text-foreground tabular-nums">
          {balance.toLocaleString("vi-VN")}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Tương đương {formatVND(pointsToVnd(balance, rate))} khi thanh toán
        </p>
        {pointsDebt > 0 && (
          <p className="mt-3 rounded-lg bg-warning-muted px-3 py-2 text-xs text-warning-strong">
            Còn {pointsDebt.toLocaleString("vi-VN")} điểm cần bù từ lần tích tiếp theo do hoàn/trả hàng trước đó.
          </p>
        )}
      </div>
      <Button asChild variant="outline" className="mt-5 w-full">
        <Link to="/profile/points/rewards">
          <Gift className="size-4" />
          Đổi quà
        </Link>
      </Button>
    </Card>
  );
}

/**
 * Current tier and the distance to the next one.
 *
 * The bar measures spend inside the rolling window, not points: those are two
 * different currencies, and conflating them is the quickest way to make a
 * loyalty scheme incomprehensible.
 */
export function TierProgressCard({ tier, nextTier, spend12m = 0, windowDays = 365 }) {
  const target = nextTier?.threshold || 0;
  const percent = target > 0 ? Math.min(100, Math.round((spend12m / target) * 100)) : 100;

  return (
    <Card className="flex flex-col justify-between p-6">
      <div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="size-4" />
            Hạng thành viên
          </span>
          <TierBadge tier={tier} />
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Chi tiêu {Math.round(windowDays / 30)} tháng gần nhất
        </div>
        <div className="text-2xl font-bold text-foreground">
          {formatVND(spend12m)}
        </div>
      </div>

      <div className="mt-5">
        <Progress
          value={percent}
          intent="brand"
          label="Tiến độ lên hạng tiếp theo"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {nextTier ? (
            <>
              Chi thêm{" "}
              <span className="font-semibold text-foreground">
                {formatVND(nextTier.remaining ?? Math.max(0, target - spend12m))}
              </span>{" "}
              để lên hạng {nextTier.label}
            </>
          ) : (
            <>Bạn đang ở hạng cao nhất. Tiếp tục mua sắm để giữ hạng.</>
          )}
        </p>
      </div>
    </Card>
  );
}
