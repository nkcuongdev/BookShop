import { CreditCard, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PaymentStatusBadge } from "./OrderStatusBadge";
import { formatDateTimeVN } from "@/utils/format.js";

const METHOD_LABEL = {
  COD: { label: "Thanh toán khi nhận hàng (COD)", icon: Wallet },
  VNPAY: { label: "VNPay", icon: CreditCard },
  MOMO: { label: "MoMo", icon: CreditCard },
};

export default function OrderPaymentCard({ payment }) {
  if (!payment) return null;
  const method = METHOD_LABEL[payment.method] || {
    label: "Thanh toán online",
    icon: CreditCard,
  };
  const Icon = method.icon;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-secondary-800 text-sm">
          Thanh toán
        </h3>
        <PaymentStatusBadge status={payment.status} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-secondary-800">
            {method.label}
          </p>
          {payment.paidAt && (
            <p className="text-xs text-secondary-500 mt-0.5">
              Thanh toán lúc {formatDateTimeVN(payment.paidAt)}
            </p>
          )}
          {payment.transactionId && (
            <p className="text-xs text-secondary-500 mt-0.5 font-mono truncate">
              TxnID: {payment.transactionId}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
