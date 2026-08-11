import { Gift, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatVND } from "@/utils/format";
import { voucherValueLabel } from "@/utils/loyalty";

/**
 * One row of the rewards catalogue.
 *
 * Styled after VoucherPickerDialog's cards so a reward and a voucher read as
 * the same kind of thing, which is what they become once redeemed.
 */
export default function RewardCard({ gift, onRedeem, redeeming = false }) {
  const disabled = !gift.eligible || redeeming;

  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border border-primary-100 bg-primary-50/30 p-4",
        !gift.eligible && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant={gift.voucher.scope === "shipping" ? "info" : "secondary"}>
          {gift.voucher.scope === "shipping"
            ? "Giảm phí vận chuyển"
            : "Giảm giá đơn hàng"}
        </Badge>
        {gift.minTierLabel && (
          <Badge variant="outline">Hạng {gift.minTierLabel}+</Badge>
        )}
      </div>

      <h3 className="mt-3 font-semibold">{gift.name}</h3>
      <p className="mt-0.5 text-lg font-bold text-primary">
        {voucherValueLabel(gift.voucher)}
      </p>

      {gift.description && (
        <p className="mt-1 text-sm text-muted-foreground">{gift.description}</p>
      )}

      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {gift.voucher.minOrder > 0 && (
          <li>Đơn tối thiểu {formatVND(gift.voucher.minOrder)}</li>
        )}
        <li>Hạn dùng {gift.voucher.validDays} ngày sau khi đổi</li>
        {gift.remaining !== null && <li>Còn {gift.remaining} phần</li>}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-primary-100 pt-3">
        <span className="flex items-center gap-1.5 text-lg font-bold text-primary">
          <Sparkles className="size-4" />
          {gift.pointsCost.toLocaleString("vi-VN")} điểm
        </span>
        <Button
          size="sm"
          disabled={disabled}
          loading={redeeming}
          onClick={() => onRedeem?.(gift)}
        >
          <Gift className="size-4" />
          {gift.eligible ? "Đổi ngay" : gift.ineligibleReason || "Không khả dụng"}
        </Button>
      </div>
    </article>
  );
}
