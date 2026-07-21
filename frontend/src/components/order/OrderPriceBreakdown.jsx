import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/utils/format.js";

export default function OrderPriceBreakdown({ order }) {
  const subtotal = order.subtotal ?? 0;
  const discount = order.discountAmount ?? 0;
  const shippingDiscount =
    order.shippingDiscountAmount ??
    (order.voucher?.scope === "shipping" ? discount : 0);
  const orderDiscount = Math.max(0, discount - shippingDiscount);
  const pointsDiscount = order.pointsDiscountAmount ?? 0;
  const pointsUsed = order.pointsRedeemed ?? 0;
  const shippingFee = order.shippingFee ?? 0;
  const total = order.totalAmount ?? subtotal - discount + shippingFee;
  const voucherCode =
    order.voucher?.scope === "shipping" ? "" : order.voucher?.code;
  const shippingVoucherCode =
    order.shippingVoucher?.code ||
    (order.voucher?.scope === "shipping" ? order.voucher?.code : "");

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-foreground text-sm mb-3">
        Chi tiết thanh toán
      </h3>
      <dl className="space-y-2 text-sm">
        <Row label="Tạm tính" value={formatVND(subtotal)} />
        {orderDiscount > 0 && (
          <DiscountRow
            label="Giảm giá đơn hàng"
            code={voucherCode}
            amount={orderDiscount}
          />
        )}
        {shippingDiscount > 0 && (
          <DiscountRow
            label="Giảm phí vận chuyển"
            code={shippingVoucherCode || voucherCode}
            amount={shippingDiscount}
          />
        )}
        {pointsDiscount > 0 && (
          <DiscountRow
            label={`Điểm thưởng (${pointsUsed} điểm)`}
            amount={pointsDiscount}
          />
        )}
        <Row
          label="Phí vận chuyển"
          value={
            shippingFee > 0 ? (
              formatVND(shippingFee)
            ) : (
              <span className="text-success-strong font-medium">Miễn phí</span>
            )
          }
        />
        <div className="pt-3 mt-1 border-t border-border flex items-center justify-between">
          <dt className="text-base font-semibold text-foreground">
            Tổng cộng
          </dt>
          <dd className="text-lg font-bold text-primary">
            {formatVND(total)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function DiscountRow({ label, code, amount }) {
  return (
    <Row
      label={
        <span className="flex items-center gap-2">
          {label}
          {code && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {code}
            </Badge>
          )}
        </span>
      }
      value={`- ${formatVND(amount)}`}
      valueClassName="font-medium text-success-strong"
    />
  );
}

function Row({ label, value, valueClassName = "" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-foreground ${valueClassName}`}>{value}</dd>
    </div>
  );
}
