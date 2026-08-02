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
  PAYMENT_TERMS,
  supplierDefaults,
  supplierSchema,
  supplierToForm,
} from "@/features/admin/suppliers/schema";
import {
  useCreateSupplier,
  useUpdateSupplier,
} from "@/features/admin/suppliers/hooks";

export function SupplierFormDialog({ open, onOpenChange, supplier }) {
  const isEdit = Boolean(supplier);
  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();

  const methods = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: supplierDefaults,
  });

  useEffect(() => {
    if (open) methods.reset(supplierToForm(supplier));
  }, [open, supplier, methods]);

  const onSubmit = methods.handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: supplier._id, data: values });
      } else {
        await createMut.mutateAsync(values);
      }
      onOpenChange(false);
    } catch (error) {
      // The server owns uniqueness of `code`; surface it on the field rather
      // than only as a toast so the user can correct it in place.
      if (error?.status === 409) {
        methods.setError("code", { message: error.message });
      }
    }
  });

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa nhà cung cấp" : "Thêm nhà cung cấp"}
          </DialogTitle>
        </DialogHeader>

        <FormProvider {...methods}>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="code" label="Mã nhà cung cấp" required>
                {(field) => (
                  <Input
                    {...field}
                    placeholder="NXBTRE"
                    disabled={isEdit}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                )}
              </FormField>
              <FormField name="name" label="Tên nhà cung cấp" required>
                {(field) => <Input {...field} placeholder="NXB Trẻ" />}
              </FormField>
              <FormField name="taxCode" label="Mã số thuế">
                {(field) => <Input {...field} placeholder="0301234567" />}
              </FormField>
              <FormField name="phone" label="Điện thoại">
                {(field) => <Input {...field} placeholder="028 3931 6289" />}
              </FormField>
              <FormField name="email" label="Email">
                {(field) => <Input {...field} type="email" placeholder="hopthu@nxbtre.com.vn" />}
              </FormField>
              <FormField name="website" label="Website">
                {(field) => <Input {...field} placeholder="https://nxbtre.com.vn" />}
              </FormField>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Địa chỉ</p>
              <FormField name="address.line" label="Địa chỉ">
                {(field) => <Input {...field} placeholder="161B Lý Chính Thắng" />}
              </FormField>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField name="address.ward" label="Phường/Xã">
                  {(field) => <Input {...field} />}
                </FormField>
                <FormField name="address.district" label="Quận/Huyện">
                  {(field) => <Input {...field} />}
                </FormField>
                <FormField name="address.province" label="Tỉnh/Thành phố">
                  {(field) => <Input {...field} />}
                </FormField>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Người liên hệ</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField name="contactPerson.name" label="Họ tên">
                  {(field) => <Input {...field} />}
                </FormField>
                <FormField name="contactPerson.phone" label="Điện thoại">
                  {(field) => <Input {...field} />}
                </FormField>
                <FormField name="contactPerson.email" label="Email">
                  {(field) => <Input {...field} type="email" />}
                </FormField>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField name="paymentTerms" label="Điều khoản thanh toán">
                {(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((term) => (
                        <SelectItem key={term.value} value={term.value}>
                          {term.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField
                name="leadTimeDays"
                label="Thời gian giao (ngày)"
                description="Dùng để gợi ý thời điểm đặt hàng lại"
              >
                {(field) => <Input {...field} type="number" min={0} max={365} />}
              </FormField>
              <FormField name="status" label="Trạng thái">
                {(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Đang hợp tác</SelectItem>
                      <SelectItem value="inactive">Ngừng hợp tác</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>

            <FormField name="note" label="Ghi chú">
              {(field) => <Textarea {...field} rows={3} />}
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Tạo mới"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
