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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookPicker } from "@/components/admin/inventory/BookPicker";
import { useAdjustStock } from "@/features/admin/inventory/hooks";

const defaults = { book: null, quantity: "", reason: "" };

/**
 * Manual stock correction — the escape hatch for cases no document covers.
 *
 * The reason is mandatory because this is the one movement type with no source
 * document behind it; without it the ledger entry would be unexplainable.
 */
export function StockAdjustDialog({ open, book = null, ...props }) {
  // Keyed on the preset book as well as `open`, so opening the dialog from a
  // different row starts from that row rather than the previous one.
  return (
    <StockAdjustDialogBody
      key={`${open ? "open" : "closed"}:${book?._id || "none"}`}
      open={open}
      book={book}
      {...props}
    />
  );
}

function StockAdjustDialogBody({ open, onOpenChange, book: presetBook = null }) {
  const [form, setForm] = useState({ ...defaults, book: presetBook });
  const [errors, setErrors] = useState({});
  const adjustMut = useAdjustStock();

  const delta = Number(form.quantity);
  const isValidDelta = Number.isInteger(delta) && delta !== 0;
  const projected =
    form.book && isValidDelta ? (form.book.stock ?? 0) + delta : null;

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!form.book) nextErrors.book = "Chọn sách cần điều chỉnh";
    if (!isValidDelta) nextErrors.quantity = "Nhập số nguyên khác 0";
    else if (projected !== null && projected < 0) {
      nextErrors.quantity = "Tồn kho sau điều chỉnh không được âm";
    }
    if (!form.reason.trim()) nextErrors.reason = "Vui lòng nhập lý do điều chỉnh";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    await adjustMut.mutateAsync({
      bookId: String(form.book._id),
      quantity: delta,
      reason: form.reason.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Điều chỉnh tồn kho</DialogTitle>
          <DialogDescription>
            Dùng khi cần sửa tồn mà không có phiếu nhập/xuất tương ứng. Mọi điều
            chỉnh đều được ghi vào sổ cái kèm lý do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Sách <span className="text-danger-strong">*</span>
            </Label>
            {form.book ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {form.book.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tồn hiện tại: {form.book.stock ?? 0}
                  </p>
                </div>
                {!presetBook && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm((current) => ({ ...current, book: null }))}
                  >
                    Đổi
                  </Button>
                )}
              </div>
            ) : (
              <BookPicker
                onSelect={(book) => {
                  setForm((current) => ({ ...current, book }));
                  setErrors((current) => ({ ...current, book: undefined }));
                }}
                placeholder="Chọn sách cần điều chỉnh..."
              />
            )}
            {errors.book && <p className="text-xs text-danger-strong">{errors.book}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjust-quantity">
              Số lượng điều chỉnh <span className="text-danger-strong">*</span>
            </Label>
            <Input
              id="adjust-quantity"
              type="number"
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({ ...current, quantity: event.target.value }))
              }
              placeholder="Ví dụ: 5 để tăng, -3 để giảm"
            />
            {projected !== null && !errors.quantity && (
              <p className="text-xs text-muted-foreground">
                Tồn sau điều chỉnh: <strong>{projected}</strong>
              </p>
            )}
            {errors.quantity && (
              <p className="text-xs text-danger-strong">{errors.quantity}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">
              Lý do <span className="text-danger-strong">*</span>
            </Label>
            <Textarea
              id="adjust-reason"
              rows={3}
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({ ...current, reason: event.target.value }))
              }
              placeholder="Ví dụ: bổ sung tồn thiếu do nhập liệu sai ngày 01/09"
            />
            {errors.reason && (
              <p className="text-xs text-danger-strong">{errors.reason}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={adjustMut.isPending}>
            {adjustMut.isPending ? "Đang lưu..." : "Điều chỉnh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
