import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { FormField } from "@/components/admin/common/FormField";
import {
  promotionSchema,
  promotionDefaults,
} from "@/features/admin/promotions/schema";
import {
  useCreatePromotion,
  usePromotionBooks,
  useUpdatePromotion,
} from "@/features/admin/promotions/hooks";
import { useCategories } from "@/features/admin/categories/hooks";
import useDebounce from "@/hooks/useDebounce";
import { formatVND } from "@/utils/format";
import { cn } from "@/lib/utils";

function BookPicker({ value = [], onChange }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);
  const booksQ = usePromotionBooks({ search: debounced, limit: 80 });

  const selectedIds = useMemo(() => new Set(value), [value]);
  const selectedBooks = (booksQ.data || []).filter((b) => selectedIds.has(b._id));

  const toggle = (bookId) => {
    if (selectedIds.has(bookId)) {
      onChange(value.filter((id) => id !== bookId));
    } else {
      onChange([...value, bookId]);
    }
  };

  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-2">
          <span className="text-xs text-secondary-500 self-center mr-1">
            Đã chọn {value.length}:
          </span>
          {selectedBooks.slice(0, 6).map((b) => (
            <span
              key={b._id}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-inset ring-gray-200"
            >
              <span className="max-w-[160px] truncate">{b.title}</span>
              <button
                type="button"
                onClick={() => toggle(b._id)}
                className="text-secondary-400 hover:text-rose-600"
                aria-label="Bỏ chọn"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {selectedBooks.length > 6 && (
            <span className="text-xs text-secondary-500 self-center">
              +{selectedBooks.length - 6}
            </span>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-xs text-rose-600 hover:underline self-center"
          >
            Xoá tất cả
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400" />
        <Input
          placeholder="Tìm sách theo tên hoặc tác giả..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8"
        />
      </div>

      {/* Result list */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white">
        {booksQ.isLoading ? (
          <div className="p-6 text-center text-xs text-secondary-500">
            Đang tải...
          </div>
        ) : (booksQ.data || []).length === 0 ? (
          <div className="p-6 text-center text-xs text-secondary-500">
            Không có sách phù hợp
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(booksQ.data || []).map((b) => {
              const checked = selectedIds.has(b._id);
              return (
                <li
                  key={b._id}
                  className={cn(
                    "flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer transition-colors",
                    checked && "bg-primary-50/60"
                  )}
                  onClick={() => toggle(b._id)}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(b._id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {b.imageUrl ? (
                    <img
                      src={b.imageUrl}
                      alt=""
                      className="h-10 w-8 rounded object-cover bg-gray-100"
                    />
                  ) : (
                    <div className="h-10 w-8 rounded bg-gray-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-secondary-800 line-clamp-1">
                      {b.title}
                    </p>
                    <p className="text-xs text-secondary-500 line-clamp-1">
                      {b.author} · {b.category}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary-600 shrink-0">
                    {formatVND(b.price)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PromotionFormDialog({ open, onOpenChange, promotion }) {
  const isEdit = !!promotion;
  const createMut = useCreatePromotion();
  const updateMut = useUpdatePromotion();
  const categoriesQ = useCategories();

  const methods = useForm({
    resolver: zodResolver(promotionSchema),
    defaultValues: promotionDefaults,
  });

  const scope = useWatch({ control: methods.control, name: "scope" });
  const type = useWatch({ control: methods.control, name: "type" });

  useEffect(() => {
    if (!open) return;
    if (promotion) {
      methods.reset({
        name: promotion.name || "",
        description: promotion.description || "",
        type: promotion.type || "percent",
        value: promotion.value ?? 0,
        startDate: promotion.startDate?.slice(0, 10) || "",
        endDate: promotion.endDate?.slice(0, 10) || "",
        scope: promotion.scope || "products",
        books:
          (promotion.books || []).map((b) =>
            typeof b === "string" ? b : b._id
          ) || [],
        category: promotion.category || "",
        active: promotion.active ?? true,
      });
    } else {
      methods.reset(promotionDefaults);
    }
  }, [open, promotion, methods]);

  const onSubmit = methods.handleSubmit(async (values) => {
    const payload = {
      ...values,
      startDate: new Date(values.startDate).toISOString(),
      endDate: new Date(values.endDate).toISOString(),
    };
    if (isEdit) {
      await updateMut.mutateAsync({ id: promotion._id, data: payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    onOpenChange(false);
  });

  const categories = categoriesQ.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa khuyến mãi" : "Tạo khuyến mãi mới"}
          </DialogTitle>
        </DialogHeader>

        <FormProvider {...methods}>
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Basic info */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                name="name"
                label="Tên chương trình"
                required
                className="md:col-span-2"
              >
                {(field) => (
                  <Input placeholder="Flash sale cuối tuần" {...field} />
                )}
              </FormField>

              <FormField name="type" label="Loại giảm giá" required>
                {(field) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Phần trăm (%)</SelectItem>
                      <SelectItem value="fixed">Số tiền (VND)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>

              <FormField
                name="value"
                label={
                  type === "percent" ? "Giá trị (%)" : "Giá trị giảm (VND)"
                }
                required
              >
                {(field) => (
                  <Input
                    type="number"
                    min={0}
                    max={type === "percent" ? 100 : undefined}
                    {...field}
                  />
                )}
              </FormField>

              <FormField name="startDate" label="Bắt đầu" required>
                {(field) => <Input type="date" {...field} />}
              </FormField>

              <FormField name="endDate" label="Kết thúc" required>
                {(field) => <Input type="date" {...field} />}
              </FormField>

              <FormField
                name="description"
                label="Mô tả"
                className="md:col-span-2"
              >
                {(field) => (
                  <Textarea
                    rows={2}
                    placeholder="Mô tả ngắn cho chương trình..."
                    {...field}
                  />
                )}
              </FormField>
            </div>

            {/* Scope */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-secondary-900">
                  Áp dụng cho
                </p>
                <p className="text-xs text-secondary-500">
                  Chọn phạm vi sản phẩm được giảm giá
                </p>
              </div>

              <FormField name="scope" label="" className="space-y-2">
                {(field) => (
                  <Tabs
                    value={field.value}
                    onValueChange={field.onChange}
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="products">
                        Sản phẩm cụ thể
                      </TabsTrigger>
                      <TabsTrigger value="category">Danh mục</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
              </FormField>

              {scope === "products" ? (
                <FormField name="books" label="Chọn sản phẩm">
                  {(field) => (
                    <BookPicker value={field.value} onChange={field.onChange} />
                  )}
                </FormField>
              ) : (
                <FormField name="category" label="Danh mục áp dụng">
                  {(field) => (
                    <Select
                      value={field.value || ""}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn danh mục" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c._id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              )}
            </div>

            {/* Active */}
            <FormField name="active" label="">
              {(field) => (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={!!field.value}
                    onCheckedChange={(v) => field.onChange(!!v)}
                  />
                  <span className="text-sm text-secondary-800">
                    Kích hoạt ngay sau khi lưu
                  </span>
                </label>
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
