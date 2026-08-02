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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/features/admin/categories/hooks";
import { useCreateStockCount } from "@/features/admin/inventory/hooks";
import { COUNT_SCOPES } from "@/features/admin/inventory/constants";

const defaults = { scope: "ALL", scopeValue: "", note: "" };

/** Remounted on open so the form always starts from `defaults`. */
export function CreateStockCountDialog({ open, ...props }) {
  return <CreateStockCountDialogBody key={open ? "open" : "closed"} open={open} {...props} />;
}

function CreateStockCountDialogBody({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(defaults);
  const [error, setError] = useState("");
  const categoriesQ = useCategories();
  const createMut = useCreateStockCount();

  const handleSubmit = async () => {
    if (form.scope === "CATEGORY" && !form.scopeValue) {
      setError("Chọn danh mục cần kiểm");
      return;
    }
    const result = await createMut.mutateAsync(form);
    const created = result?.data?.count;
    onOpenChange(false);
    if (created) onCreated?.(created);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo phiếu kiểm kho</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ chốt tồn hiện tại của các sách trong phạm vi để đối chiếu
            với số đếm thực tế.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="scope">Phạm vi kiểm</Label>
            <Select
              value={form.scope}
              onValueChange={(value) => {
                setForm((current) => ({ ...current, scope: value, scopeValue: "" }));
                setError("");
              }}
            >
              <SelectTrigger id="scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNT_SCOPES.map((scope) => (
                  <SelectItem key={scope.value} value={scope.value}>
                    {scope.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.scope === "CATEGORY" && (
            <div className="space-y-1.5">
              <Label htmlFor="scopeValue">
                Danh mục <span className="text-danger-strong">*</span>
              </Label>
              <Select
                value={form.scopeValue}
                onValueChange={(value) => {
                  setForm((current) => ({ ...current, scopeValue: value }));
                  setError("");
                }}
              >
                <SelectTrigger id="scopeValue">
                  <SelectValue placeholder="Chọn danh mục" />
                </SelectTrigger>
                <SelectContent>
                  {(categoriesQ.data || []).map((category) => (
                    <SelectItem key={category._id} value={category.slug}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error && <p className="text-xs text-danger-strong">{error}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="count-note">Ghi chú</Label>
            <Textarea
              id="count-note"
              rows={2}
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="Ví dụ: kiểm kho định kỳ quý 3"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? "Đang tạo..." : "Tạo phiếu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
