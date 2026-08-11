import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils/format";
import TierBadge from "./TierBadge";

/**
 * The ladder, with the customer's rung highlighted.
 *
 * Tiers come from the API rather than a local table so that retuning the
 * programme in admin changes what customers are told, without a deploy.
 */
export default function TierBenefitsPanel({ tiers = [], currentTierKey = "" }) {
  if (tiers.length === 0) return null;

  return (
    <Card className="p-6">
      <h2 className="text-h3 font-semibold">Quyền lợi từng hạng</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hạng được xét theo tổng chi tiêu 12 tháng gần nhất.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          const isCurrent = tier.key === currentTierKey;
          return (
            <div
              key={tier.key}
              className={cn(
                "rounded-xl border p-4 transition-colors",
                isCurrent
                  ? "border-transparent ring-2 ring-primary bg-primary-50/40"
                  : "border-border"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <TierBadge tier={tier} />
                {isCurrent && <Badge variant="success">Hạng của bạn</Badge>}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {tier.threshold > 0
                  ? `Chi tiêu từ ${formatVND(tier.threshold)}`
                  : "Áp dụng cho mọi thành viên"}
              </p>
              <p className="text-sm font-medium">
                Tích điểm ×{tier.multiplier}
              </p>

              {tier.benefits?.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {tier.benefits.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success-strong" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
