import { useEffect } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { FormField } from "@/components/admin/common/FormField";
import { PermissionGate } from "@/components/admin/common/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useLoyaltyProgram,
  useUpdateLoyaltyProgram,
} from "@/features/admin/loyalty/hooks";
import {
  loyaltyProgramDefaults,
  loyaltyProgramSchema,
} from "@/features/admin/loyalty/schema";

export default function LoyaltySettings() {
  const query = useLoyaltyProgram();
  const mutation = useUpdateLoyaltyProgram();

  const methods = useForm({
    resolver: zodResolver(loyaltyProgramSchema),
    defaultValues: loyaltyProgramDefaults,
  });
  const { fields, append, remove } = useFieldArray({
    control: methods.control,
    name: "tiers",
  });

  useEffect(() => {
    if (!query.data) return;
    methods.reset({
      enabled: query.data.enabled,
      earnRate: query.data.earnRate,
      redeemEnabled: query.data.redeemEnabled,
      redeemRate: query.data.redeemRate,
      redeemMinPoints: query.data.redeemMinPoints,
      redeemMaxPercent: query.data.redeemMaxPercent,
      redeemStep: query.data.redeemStep,
      tierWindowDays: query.data.tierWindowDays,
      tierGraceDays: query.data.tierGraceDays,
      tiers: (query.data.tiers || []).map((tier) => ({
        key: tier.key,
        label: tier.label,
        threshold: tier.threshold,
        multiplier: tier.multiplier,
        benefits: tier.benefits || [],
      })),
    });
  }, [query.data, methods]);

  const onSubmit = (values) => mutation.mutateAsync(values);

  if (query.isLoading) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  const tierError = methods.formState.errors?.tiers?.message;

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
        <PageHeader
          title="Cấu hình điểm thưởng"
          description="Tỉ lệ tích điểm, cách dùng điểm và thang hạng thành viên."
          actions={
            <PermissionGate permission="loyalty.manage">
              <Button type="submit" loading={mutation.isPending}>
                <Save className="size-4" />
                Lưu cấu hình
              </Button>
            </PermissionGate>
          }
        />

        <SectionCard title="Tích điểm">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              name="earnRate"
              label="Số tiền cho 1 điểm (đ)"
              required
              description="Ví dụ 10.000 nghĩa là chi 10.000đ được 1 điểm. Chỉ tính tiền hàng, không tính phí vận chuyển."
            >
              {(field) => <Input type="number" {...field} />}
            </FormField>
            <FormField
              name="enabled"
              label="Bật chương trình"
              description="Tắt sẽ dừng cả tích và tiêu điểm."
            >
              {(field) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="Dùng điểm khi thanh toán">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              name="redeemRate"
              label="1 điểm giảm được (đ)"
              required
            >
              {(field) => <Input type="number" {...field} />}
            </FormField>
            <FormField
              name="redeemMaxPercent"
              label="Trần dùng điểm (%)"
              required
              description="Tính trên tiền hàng SAU khi trừ voucher, không gồm phí vận chuyển."
            >
              {(field) => <Input type="number" {...field} />}
            </FormField>
            <FormField
              name="redeemMinPoints"
              label="Điểm tối thiểu mỗi lần dùng"
              required
            >
              {(field) => <Input type="number" {...field} />}
            </FormField>
            <FormField
              name="redeemStep"
              label="Bội số điểm"
              required
              description="Khách chỉ dùng được số điểm là bội của giá trị này."
            >
              {(field) => <Input type="number" {...field} />}
            </FormField>
            <FormField name="redeemEnabled" label="Cho phép dùng điểm">
              {(field) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="Xét hạng thành viên">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              name="tierWindowDays"
              label="Cửa sổ xét hạng (ngày)"
              required
              description="Hạng dựa trên tổng chi tiêu trong khoảng thời gian trượt này."
            >
              {(field) => <Input type="number" {...field} />}
            </FormField>
            <FormField
              name="tierGraceDays"
              label="Ân hạn khi rớt hạng (ngày)"
              required
              description="Giữ hạng cũ thêm số ngày này trước khi hạ hạng."
            >
              {(field) => <Input type="number" {...field} />}
            </FormField>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Các hạng</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    key: "",
                    label: "",
                    threshold: 0,
                    multiplier: 1,
                    benefits: [],
                  })
                }
              >
                <Plus className="size-4" />
                Thêm hạng
              </Button>
            </div>

            {tierError && (
              <p className="text-sm text-danger-strong">{tierError}</p>
            )}

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-border p-4"
              >
                <div className="grid gap-4 sm:grid-cols-4">
                  <FormField name={`tiers.${index}.key`} label="Mã hạng" required>
                    {(f) => <Input placeholder="gold" {...f} />}
                  </FormField>
                  <FormField name={`tiers.${index}.label`} label="Tên hạng" required>
                    {(f) => <Input placeholder="Vàng" {...f} />}
                  </FormField>
                  <FormField
                    name={`tiers.${index}.threshold`}
                    label="Ngưỡng chi tiêu (đ)"
                    required
                  >
                    {(f) => <Input type="number" {...f} />}
                  </FormField>
                  <FormField
                    name={`tiers.${index}.multiplier`}
                    label="Hệ số tích điểm"
                    required
                  >
                    {(f) => <Input type="number" step="0.1" {...f} />}
                  </FormField>
                </div>

                <div className="mt-4 flex items-end gap-3">
                  <FormField
                    name={`tiers.${index}.benefits`}
                    label="Quyền lợi"
                    className="flex-1"
                    description="Mỗi dòng một quyền lợi, hiển thị cho khách."
                  >
                    {(f) => (
                      <Textarea
                        rows={2}
                        value={(f.value || []).join("\n")}
                        onChange={(event) =>
                          f.onChange(
                            event.target.value
                              .split("\n")
                              .map((line) => line.trim())
                              .filter(Boolean)
                          )
                        }
                      />
                    )}
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Xoá hạng"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4 text-danger-strong" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </form>
    </FormProvider>
  );
}
