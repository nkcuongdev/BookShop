import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/admin/common/FormField";
import {
  voucherSchema,
  voucherDefaults,
} from "@/features/admin/vouchers/schema";
import {
  useCreateVoucher,
  useUpdateVoucher,
} from "@/features/admin/vouchers/hooks";

export function VoucherFormDialog({ open, onOpenChange, voucher }) {
  const isEdit = !!voucher;
  const createMut = useCreateVoucher();
  const updateMut = useUpdateVoucher();

  const methods = useForm({
    resolver: zodResolver(voucherSchema),
    defaultValues: voucherDefaults,
  });

  useEffect(() => {
    if (open) {
      if (voucher) {
        methods.reset({
          code: voucher.code,
          type: voucher.type,
          value: voucher.value,
          minOrder: voucher.minOrder || 0,
          maxDiscount: voucher.maxDiscount || 0,
          startAt: voucher.startAt?.slice(0, 10) || "",
          endAt: voucher.endAt?.slice(0, 10) || "",
          usageLimit: voucher.usageLimit || 1,
          active: voucher.active ?? true,
          description: voucher.description || "",
        });
      } else {
        methods.reset(voucherDefaults);
      }
    }
  }, [open, voucher, methods]);

  const onSubmit = methods.handleSubmit(async (values) => {
    const payload = {
      ...values,
      startAt: new Date(values.startAt).toISOString(),
      endAt: new Date(values.endAt).toISOString(),
    };
    if (isEdit) {
      await updateMut.mutateAsync({ id: voucher._id, data: payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Chỉnh sửa voucher" : "Tạo voucher mới"}</DialogTitle>
        </DialogHeader>
        <FormProvider {...methods}>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField name="code" label="Mã" required>
              {(field) => (
                <Input
                  placeholder="WELCOME10"
                  {...field}
                  onChange={(e) =>
                    field.onChange(e.target.value.toUpperCase())
                  }
                />
              )}
            </FormField>
            <FormField name="type" label="Loại" required>
              {(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Phần trăm (%)</SelectItem>
                    <SelectItem value="fixed">Cố định (VND)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField name="value" label="Giá trị" required>
              {(field) => <Input type="number" min={0} {...field} />}
            </FormField>
            <FormField name="usageLimit" label="Số lượt sử dụng" required>
              {(field) => <Input type="number" min={1} {...field} />}
            </FormField>
            <FormField name="minOrder" label="Đơn tối thiểu (VND)">
              {(field) => <Input type="number" min={0} {...field} />}
            </FormField>
            <FormField name="maxDiscount" label="Giảm tối đa (VND)">
              {(field) => <Input type="number" min={0} {...field} />}
            </FormField>
            <FormField name="startAt" label="Bắt đầu" required>
              {(field) => <Input type="date" {...field} />}
            </FormField>
            <FormField name="endAt" label="Kết thúc" required>
              {(field) => <Input type="date" {...field} />}
            </FormField>
            <FormField name="description" label="Mô tả" className="md:col-span-2">
              {(field) => <Textarea rows={2} {...field} />}
            </FormField>
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
              >
                {isEdit ? "Cập nhật" : "Tạo mới"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
