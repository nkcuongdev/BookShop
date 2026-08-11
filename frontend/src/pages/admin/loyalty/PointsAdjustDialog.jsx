import { useEffect } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/admin/common/FormField";
import { useAdjustPoints } from "@/features/admin/loyalty/hooks";
import {
  pointsAdjustDefaults,
  pointsAdjustSchema,
} from "@/features/admin/loyalty/schema";

/**
 * Hand-adjust one customer's balance.
 *
 * This dialog is itself the confirmation step, so it deliberately does not also
 * go through useConfirm: two prompts for one deliberate action is noise.
 */
export default function PointsAdjustDialog({ member, open, onOpenChange }) {
  const methods = useForm({
    resolver: zodResolver(pointsAdjustSchema),
    defaultValues: pointsAdjustDefaults,
  });
  const mutation = useAdjustPoints();

  useEffect(() => {
    if (open) methods.reset(pointsAdjustDefaults);
  }, [open, methods]);

  const delta = useWatch({ control: methods.control, name: "points" });
  const current = Number(member?.pointsBalance) || 0;
  const parsedDelta = Number(delta) || 0;
  const projected = current + parsedDelta;
  // Balance is floored at zero in the schema, so an adjustment that would
  // overdraw is refused here rather than failing at the server.
  const wouldGoNegative = projected < 0;

  const onSubmit = async (values) => {
    await mutation.mutateAsync({ userId: member.id, ...values });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh điểm thưởng</DialogTitle>
          <DialogDescription>
            {member?.name} · Số dư hiện tại{" "}
            <strong>{current.toLocaleString("vi-VN")}</strong> điểm
          </DialogDescription>
        </DialogHeader>

        <FormProvider {...methods}>
          <form
            onSubmit={methods.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              name="points"
              label="Số điểm"
              required
              description="Số dương để cộng, số âm để trừ."
            >
              {(field) => <Input type="number" step={1} {...field} />}
            </FormField>

            <FormField
              name="reason"
              label="Lý do"
              required
              description="Ghi rõ để người kiểm tra sau này hiểu được. Tối thiểu 10 ký tự."
            >
              {(field) => (
                <Textarea
                  rows={3}
                  placeholder="Ví dụ: Đền bù sự cố giao hàng chậm đơn OD-XXXX"
                  {...field}
                />
              )}
            </FormField>

            {parsedDelta !== 0 && (
              <p
                className={
                  wouldGoNegative
                    ? "text-sm font-medium text-danger-strong"
                    : "text-sm text-muted-foreground"
                }
              >
                Số dư sau điều chỉnh:{" "}
                <strong>{projected.toLocaleString("vi-VN")}</strong> điểm
                {wouldGoNegative && " — không thể để số dư âm"}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                loading={mutation.isPending}
                disabled={wouldGoNegative}
              >
                Xác nhận điều chỉnh
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
