import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, RefreshCw, TicketPercent } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { vouchersAPI } from "@/services/api";
import { formatDateVN, formatVND } from "@/utils/format";

function voucherValueLabel(voucher) {
  return voucher.type === "percent"
    ? `Giảm ${voucher.value}%`
    : `Giảm ${formatVND(voucher.value)}`;
}

function expiryLabel(endAt) {
  const timestamp = new Date(endAt).getTime();
  return Number.isFinite(timestamp) ? formatDateVN(timestamp - 1) : "";
}

export default function VoucherPickerDialog({
  open,
  onOpenChange,
  subtotal,
  shippingFee = null,
  selectedCodes = {},
  onSelect,
  selecting = false,
}) {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const loadVouchers = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await vouchersAPI.getAvailable(
        subtotal,
        typeof shippingFee === "number" ? shippingFee : undefined
      );
      if (requestId !== requestIdRef.current) return;
      setVouchers(response?.data?.vouchers || []);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setVouchers([]);
      setError(requestError.message || "Không thể tải danh sách voucher");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [shippingFee, subtotal]);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      return undefined;
    }
    const timer = window.setTimeout(loadVouchers, 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [loadVouchers, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Voucher có thể áp dụng</DialogTitle>
          <DialogDescription>
            Danh sách đã được lọc theo giá trị giỏ hàng hiện tại. Mã riêng vẫn
            có thể nhập thủ công.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {loading &&
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-xl" />
            ))}

          {!loading && error && (
            <div className="rounded-xl border border-danger-strong/40 bg-danger-muted p-4 text-center">
              <CircleAlert className="mx-auto size-6 text-danger-strong" />
              <p className="mt-2 text-sm text-danger-strong">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={loadVouchers}
              >
                <RefreshCw className="size-4" />
                Thử lại
              </Button>
            </div>
          )}

          {!loading && !error && vouchers.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <TicketPercent className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-medium text-foreground">
                Chưa có voucher công khai phù hợp
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bạn vẫn có thể nhập mã voucher riêng ở phần tóm tắt đơn hàng.
              </p>
            </div>
          )}

          {!loading &&
            !error &&
            vouchers.map((voucher, index) => {
              const isSelected = voucher.code === selectedCodes[voucher.scope];
              const shippingKnown = typeof shippingFee === "number";
              const canApply =
                voucher.scope !== "shipping" ||
                !shippingKnown ||
                voucher.discountAmount > 0;
              return (
                <article
                  key={voucher.code}
                  className="relative overflow-hidden rounded-xl border border-primary-100 bg-primary-50/30 p-4"
                >
                  {index === 0 && voucher.discountAmount > 0 && (
                    <Badge className="absolute right-3 top-3" variant="sale">
                      Tiết kiệm nhiều nhất
                    </Badge>
                  )}
                  <div className="pr-28">
                    <Badge variant="outline" className="mb-2">
                      {voucher.scope === "shipping"
                        ? "Giảm phí vận chuyển"
                        : "Giảm giá đơn hàng"}
                    </Badge>
                    <p className="font-display text-base font-bold text-primary-700">
                      {voucherValueLabel(voucher)}
                    </p>
                    <code className="mt-1 inline-block rounded bg-card px-2 py-0.5 font-mono text-sm font-bold text-foreground">
                      {voucher.code}
                    </code>
                  </div>
                  {voucher.description && (
                    <p className="mt-2 text-base text-muted-foreground">
                      {voucher.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Đơn tối thiểu {formatVND(voucher.minOrder || 0)}
                    </span>
                    {voucher.maxDiscount > 0 && (
                      <span>Tối đa {formatVND(voucher.maxDiscount)}</span>
                    )}
                    <span>Hạn dùng {expiryLabel(voucher.endAt)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-success-strong">
                      {voucher.scope === "shipping" && !shippingKnown
                        ? "Sẽ tính sau khi nhập địa chỉ"
                        : `Giảm ngay ${formatVND(voucher.discountAmount)}`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={isSelected ? "outline" : "default"}
                      disabled={selecting || isSelected || !canApply}
                      onClick={() => onSelect?.(voucher.code)}
                      aria-label={`Áp dụng ${voucher.code}`}
                    >
                      {isSelected
                        ? "Đang dùng"
                        : canApply
                          ? "Áp dụng"
                          : "Đang miễn phí ship"}
                    </Button>
                  </div>
                </article>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
