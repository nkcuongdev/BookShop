import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, Gift, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadgeBase } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmptyState from "@/components/common/EmptyState";
import RewardCard from "@/components/loyalty/RewardCard";
import { useConfirm } from "@/hooks/useConfirm";
import useCopyToClipboard from "@/hooks/useCopyToClipboard";
import { formatDateVN, formatVND } from "@/utils/format";
import { voucherValueLabel } from "@/utils/loyalty";
import {
  useMyRedemptions,
  useRedeemReward,
  useRewards,
} from "@/features/loyalty/hooks";

const REDEMPTION_STATUS = {
  active: { label: "Còn hiệu lực", intent: "success" },
  used: { label: "Đã dùng", intent: "neutral" },
  expired: { label: "Hết hạn", intent: "danger" },
};

export default function PointsRewards() {
  const confirm = useConfirm();
  const { copy } = useCopyToClipboard();
  const [redeemedVoucher, setRedeemedVoucher] = useState(null);
  const [redeemingId, setRedeemingId] = useState("");

  const rewards = useRewards({ limit: 24 });
  const redemptions = useMyRedemptions({ limit: 20 });
  const redeemMutation = useRedeemReward();

  const balance = rewards.data?.balance ?? 0;

  const handleRedeem = async (gift) => {
    const ok = await confirm({
      title: "Đổi quà?",
      description: `Dùng ${gift.pointsCost} điểm để đổi "${gift.name}". Điểm đã trừ sẽ không được hoàn lại.`,
      confirmText: "Đổi ngay",
    });
    if (!ok) return;

    setRedeemingId(gift.id);
    try {
      const response = await redeemMutation.mutateAsync(gift.id);
      toast.success("Đổi quà thành công");
      setRedeemedVoucher(response?.data || null);
    } finally {
      setRedeemingId("");
    }
    // Failures surface through the global mutation error handler.
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/profile/points">
              <ArrowLeft className="size-4" />
              Điểm thưởng
            </Link>
          </Button>
          <h1 className="mt-1 text-h2 font-bold">Đổi quà</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-warning-muted px-4 py-2 text-sm font-semibold text-warning-strong">
          <Sparkles className="size-4" />
          {balance.toLocaleString("vi-VN")} điểm
        </div>
      </div>

      {rewards.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (rewards.data?.gifts || []).length === 0 ? (
        <EmptyState
          icon={Gift}
          title="Chưa có quà để đổi"
          description="Hãy quay lại sau, cửa hàng sẽ sớm bổ sung ưu đãi mới."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rewards.data.gifts.map((gift) => (
            <RewardCard
              key={gift.id}
              gift={gift}
              onRedeem={handleRedeem}
              redeeming={redeemingId === gift.id}
            />
          ))}
        </div>
      )}

      <Card className="p-6">
        <h2 className="text-h3 font-semibold">Quà đã đổi của tôi</h2>
        <div className="mt-4 space-y-3">
          {redemptions.isLoading ? (
            Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-xl" />
            ))
          ) : (redemptions.data?.redemptions || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bạn chưa đổi quà nào.
            </p>
          ) : (
            redemptions.data.redemptions.map((row) => {
              const status = REDEMPTION_STATUS[row.status] || REDEMPTION_STATUS.active;
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.giftName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.voucher ? voucherValueLabel(row.voucher) : ""} · HSD{" "}
                      {formatDateVN(row.expiresAt)}
                    </p>
                  </div>
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                    {row.voucherCode}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Sao chép mã ${row.voucherCode}`}
                    onClick={() => {
                      copy(row.voucherCode);
                      toast.success("Đã sao chép mã");
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <StatusBadgeBase intent={status.intent}>
                    {status.label}
                  </StatusBadgeBase>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Dialog
        open={Boolean(redeemedVoucher)}
        onOpenChange={(open) => !open && setRedeemedVoucher(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="size-5 text-success-strong" />
              Đổi quà thành công
            </DialogTitle>
            <DialogDescription>
              Bạn đã dùng {redeemedVoucher?.pointsSpent} điểm để đổi{" "}
              {redeemedVoucher?.giftName}.
            </DialogDescription>
          </DialogHeader>

          {redeemedVoucher?.voucher && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">Mã voucher của bạn</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider text-primary">
                {redeemedVoucher.voucher.code}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {voucherValueLabel(redeemedVoucher.voucher)}
                {redeemedVoucher.voucher.minOrder > 0 && (
                  <> · Đơn tối thiểu {formatVND(redeemedVoucher.voucher.minOrder)}</>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hạn dùng đến {formatDateVN(redeemedVoucher.voucher.endAt)}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                copy(redeemedVoucher?.voucher?.code || "");
                toast.success("Đã sao chép mã");
              }}
            >
              <Copy className="size-4" />
              Sao chép mã
            </Button>
            <Button asChild className="flex-1">
              <Link to="/cart">Dùng ngay</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
