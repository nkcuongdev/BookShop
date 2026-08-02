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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmation for cancelling a stock document.
 *
 * A confirmed document has already moved stock, so cancelling it writes a
 * reversing ledger entry and the reason becomes part of the audit trail —
 * hence `reasonRequired` when the document is past DRAFT.
 *
 * Remounting the body on every open is what clears the form, so the inner
 * component needs no reset effect.
 */
export function CancelDocumentDialog({ open, ...props }) {
  return <CancelDocumentDialogBody key={open ? "open" : "closed"} open={open} {...props} />;
}

function CancelDocumentDialogBody({
  open,
  onOpenChange,
  onConfirm,
  title = "Huỷ phiếu?",
  description,
  reasonRequired = false,
  isPending = false,
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const missingReason = reasonRequired && !reason.trim();

  const handleConfirm = async () => {
    setTouched(true);
    if (missingReason) return;
    await onConfirm(reason.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">
            Lý do huỷ
            {reasonRequired && <span className="ml-1 text-danger-strong">*</span>}
          </Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: nhập nhầm số lượng, nhà cung cấp giao thiếu..."
          />
          {touched && missingReason && (
            <p className="text-xs text-danger-strong">
              Vui lòng nhập lý do huỷ
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Quay lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "Đang huỷ..." : "Huỷ phiếu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
