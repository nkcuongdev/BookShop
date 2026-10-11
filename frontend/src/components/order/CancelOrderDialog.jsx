import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const PRESET_REASONS = [
  "Tôi đổi ý, không muốn mua nữa",
  "Tôi muốn đổi sản phẩm khác",
  "Thông tin giao hàng không chính xác",
  "Thời gian giao hàng quá lâu",
];

export default function CancelOrderDialog({
  open,
  onOpenChange,
  onConfirm,
  loading = false,
  title = "Huỷ đơn hàng",
  description = "Bạn có chắc muốn huỷ đơn hàng này? Hành động không thể hoàn tác.",
  presets = PRESET_REASONS,
  // Admin cancellations must say why; the customer may leave it empty.
  requireReason = false,
  confirmText = "Xác nhận huỷ",
  // Opt-in (admin drawer, one dialog reused across orders): clear the reason
  // when the dialog is dismissed, and keep it when onConfirm reports failure
  // by returning false. The customer page keeps its original behaviour.
  resetOnClose = false,
}) {
  const [reason, setReason] = useState("");

  const handleConfirm = async () => {
    const result = await onConfirm(reason.trim());
    if (result !== false) setReason("");
  };

  const handleOpenChange = (next) => {
    if (!next && resetOnClose) setReason("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label htmlFor="cancel-reason">
            {requireReason ? "Lý do huỷ (bắt buộc)" : "Lý do (không bắt buộc)"}
          </Label>
          <div className="flex flex-wrap gap-2">
            {presets.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="text-xs px-3 py-1.5 rounded-full border border-border text-foreground hover:bg-muted hover:border-primary-300 transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
          <Textarea
            id="cancel-reason"
            rows={3}
            placeholder="Nhập lý do cụ thể..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Không, giữ đơn
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || (requireReason && reason.trim().length < 3)}
          >
            {loading ? "Đang xử lý..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
