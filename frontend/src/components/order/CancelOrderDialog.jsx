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
}) {
  const [reason, setReason] = useState("");

  const handleConfirm = async () => {
    await onConfirm(reason.trim());
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label htmlFor="cancel-reason">Lý do (không bắt buộc)</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-secondary-700 hover:bg-gray-50 hover:border-primary-300 transition-colors"
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
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Không, giữ đơn
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Đang xử lý..." : "Xác nhận huỷ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
