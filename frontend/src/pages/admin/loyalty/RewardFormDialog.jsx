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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/admin/common/FormField";
import {
  useCreateGift,
  useLoyaltyProgram,
  useUpdateGift,
} from "@/features/admin/loyalty/hooks";
import { giftDefaults, giftSchema } from "@/features/admin/loyalty/schema";

export default function RewardFormDialog({ open, onOpenChange, gift }) {
  const isEdit = Boolean(gift);
  const program = useLoyaltyProgram();
  const createMutation = useCreateGift();
  const updateMutation = useUpdateGift();

  const methods = useForm({
    resolver: zodResolver(giftSchema),
    defaultValues: giftDefaults,
  });

  const voucherType = useWatch({
    control: methods.control,
    name: "voucherTemplate.type",
  });

  useEffect(() => {
    if (!open) return;
    if (gift) {
      methods.reset({
        code: gift.code,
        name: gift.name,
        description: gift.description || "",
        imageUrl: gift.imageUrl || "",
        pointsCost: gift.pointsCost,
        minTierKey: gift.minTierKey || "",
        stock: gift.stock,
        perUserLimit: gift.perUserLimit,
        active: gift.active,
        sortOrder: gift.sortOrder,
        voucherTemplate: {
          type: gift.voucherTemplate.type,
          scope: gift.voucherTemplate.scope,
          value: gift.voucherTemplate.value,
          minOrder: gift.voucherTemplate.minOrder,
          maxDiscount: gift.voucherTemplate.maxDiscount,
          validDays: gift.voucherTemplate.validDays,
        },
      });
    } else {
      methods.reset(giftDefaults);
    }
  }, [open, gift, methods]);

  const onSubmit = async (values) => {
    if (isEdit) await updateMutation.mutateAsync({ id: gift.id, data: values });
    else await createMutation.mutateAsync(values);
    onOpenChange(false);
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa quà" : "Tạo quà mới"}</DialogTitle>
          <DialogDescription>
            Mỗi lần khách đổi, hệ thống đúc một mã voucher riêng theo khuôn dưới đây.
          </DialogDescription>
        </DialogHeader>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="code"
                label="Mã quà"
                required
                description="Chữ in hoa, số và _. Tối đa 20 ký tự."
              >
                {(field) => (
                  <Input
                    placeholder="GIAM20K"
                    disabled={isEdit}
                    {...field}
                    onChange={(event) =>
                      field.onChange(event.target.value.toUpperCase())
                    }
                  />
                )}
              </FormField>
              <FormField name="name" label="Tên quà" required>
                {(field) => <Input placeholder="Voucher giảm 20.000đ" {...field} />}
              </FormField>
            </div>

            <FormField name="description" label="Mô tả">
              {(field) => <Textarea rows={2} {...field} />}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField name="pointsCost" label="Điểm cần đổi" required>
                {(field) => <Input type="number" {...field} />}
              </FormField>
              <FormField
                name="stock"
                label="Số lượng"
                description="0 là không giới hạn."
              >
                {(field) => <Input type="number" {...field} />}
              </FormField>
              <FormField name="perUserLimit" label="Giới hạn mỗi khách">
                {(field) => <Input type="number" {...field} />}
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="minTierKey"
                label="Hạng tối thiểu"
                description="Để trống nếu mọi hạng đều đổi được."
              >
                {(field) => (
                  <Select
                    value={field.value || "any"}
                    onValueChange={(value) =>
                      field.onChange(value === "any" ? "" : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Mọi hạng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Mọi hạng</SelectItem>
                      {(program.data?.tiers || []).map((tier) => (
                        <SelectItem key={tier.key} value={tier.key}>
                          {tier.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField name="sortOrder" label="Thứ tự hiển thị">
                {(field) => <Input type="number" {...field} />}
              </FormField>
            </div>

            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">Khuôn voucher</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="voucherTemplate.type" label="Loại giảm" required>
                  {(field) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Số tiền cố định</SelectItem>
                        <SelectItem value="percent">Phần trăm</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField name="voucherTemplate.scope" label="Áp dụng cho" required>
                  {(field) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="order">Tiền hàng</SelectItem>
                        <SelectItem value="shipping">Phí vận chuyển</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField
                  name="voucherTemplate.value"
                  label={voucherType === "percent" ? "Giá trị (%)" : "Giá trị (đ)"}
                  required
                >
                  {(field) => <Input type="number" {...field} />}
                </FormField>
                {/* A cap only means anything for a percentage discount. */}
                {voucherType === "percent" && (
                  <FormField
                    name="voucherTemplate.maxDiscount"
                    label="Giảm tối đa (đ)"
                    description="0 là không giới hạn."
                  >
                    {(field) => <Input type="number" {...field} />}
                  </FormField>
                )}
                <FormField name="voucherTemplate.minOrder" label="Đơn tối thiểu (đ)">
                  {(field) => <Input type="number" {...field} />}
                </FormField>
                <FormField
                  name="voucherTemplate.validDays"
                  label="Hạn dùng (ngày)"
                  required
                  description="Tính từ lúc khách đổi."
                >
                  {(field) => <Input type="number" {...field} />}
                </FormField>
              </div>
            </div>

            <FormField name="active" label="Đang bật">
              {(field) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Huỷ
              </Button>
              <Button type="submit" loading={pending}>
                {isEdit ? "Lưu thay đổi" : "Tạo quà"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
