import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/utils/format.js";

export default function OrderPriceBreakdown({ order }) {
  const subtotal = order.subtotal ?? 0;
  const discount = order.discountAmount ?? 0;
  const shippingFee = order.shippingFee ?? 0;
  const total = order.totalAmount ?? subtotal - discount + shippingFee;
  const voucherCode = order.voucher?.code;

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-secondary-800 text-sm mb-3">
        Chi tiết thanh toán
      </h3>
      <dl className="space-y-2 text-sm">
        <Row label="Tạm tính" value={formatVND(subtotal)} />
        <Row
          label={
            <span className="flex items-center gap-2">
              Giảm giá
              {voucherCode && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {voucherCode}
                </Badge>
              )}
            </span>
          }
          value={discount > 0 ? `- ${formatVND(discount)}` : formatVND(0)}
          valueClassName={discount > 0 ? "text-emerald-600 font-medium" : ""}
        />
        <Row
          label="Phí vận chuyển"
          value={
            shippingFee > 0 ? (
              formatVND(shippingFee)
            ) : (
              <span className="text-emerald-600 font-medium">Miễn phí</span>
            )
          }
        />
        <div className="pt-3 mt-1 border-t border-gray-200 flex items-center justify-between">
          <dt className="text-base font-semibold text-secondary-800">
            Tổng cộng
          </dt>
          <dd className="text-lg font-bold text-primary-600">
            {formatVND(total)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function Row({ label, value, valueClassName = "" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-secondary-600">{label}</dt>
      <dd className={`text-secondary-800 ${valueClassName}`}>{value}</dd>
    </div>
  );
}
