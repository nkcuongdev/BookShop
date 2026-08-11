import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils/format";

// Statuses where points are settled: delivered means they landed, refunded and
// cancelled mean nothing more is coming.
const SETTLED = new Set(["DELIVERED", "REFUNDED", "REFUNDING", "CANCELLED", "FAILED"]);

/**
 * What this order did to the customer's points.
 *
 * Renders nothing when the order neither spent nor earned any, so it stays out
 * of the way of the orders that predate the programme.
 */
export default function OrderPointsCard({ order }) {
  const used = Number(order?.pointsRedeemed) || 0;
  const usedValue = Number(order?.pointsDiscountAmount) || 0;
  const earned = Number(order?.pointsEarned) || 0;
  const delivered = order?.status === "DELIVERED";
  const settled = SETTLED.has(order?.status);

  if (used === 0 && earned === 0 && settled) return null;

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-warning-strong" />
        Điểm thưởng
      </h3>

      <dl className="mt-3 space-y-2 text-sm">
        {used > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Đã dùng</dt>
            <dd className="font-medium">
              {used.toLocaleString("vi-VN")} điểm
              <span className="ml-1 text-muted-foreground">
                (−{formatVND(usedValue)})
              </span>
            </dd>
          </div>
        )}

        {earned > 0 ? (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Đã tích</dt>
            <dd className="font-medium text-success-strong">
              +{earned.toLocaleString("vi-VN")} điểm
            </dd>
          </div>
        ) : (
          !settled && (
            <div
              className={cn(
                "flex items-center justify-between",
                !delivered && "text-muted-foreground"
              )}
            >
              <dt>Sẽ nhận</dt>
              <dd className="text-xs">Sau khi đơn giao thành công</dd>
            </div>
          )
        )}
      </dl>

      <Link
        to="/profile/points"
        className="mt-3 inline-block text-xs text-primary hover:underline"
      >
        Xem điểm thưởng của tôi
      </Link>
    </Card>
  );
}
