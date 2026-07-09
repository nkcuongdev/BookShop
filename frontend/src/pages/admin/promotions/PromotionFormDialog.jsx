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
import BookCover from "@/components/book/BookCover";

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
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-dashed border-border bg-muted p-2">
          <span className="text-xs text-muted-foreground self-center mr-1">
            Đã chọn {value.length}:
          </span>
          {selectedBooks.slice(0, 6).map((b) => (
            <span
              key={b._id}
              className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs ring-1 ring-inset ring-border"
            >
              <span className="max-w-[160px] truncate">{b.title}</span>
              <button
                type="button"
                onClick={() => toggle(b._id)}
                className="text-muted-foreground/70 hover:text-danger-strong"
                aria-label="Bỏ chọn"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {selectedBooks.length > 6 && (
            <span className="text-xs text-muted-foreground self-center">
              +{selectedBooks.length - 6}
            </span>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-xs text-danger-strong hover:underline self-center"
          >
            Xoá tất cả
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          placeholder="Tìm sách theo tên hoặc tác giả..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8"
        />
      </div>

      {/* Result list */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
        {booksQ.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Đang tải...
          </div>
        ) : (booksQ.data || []).length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Không có sách phù hợp
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(booksQ.data || []).map((b) => {
              const checked = selectedIds.has(b._id);
              return (
                <li
                  key={b._id}
                  className={cn(
                    "flex items-center gap-3 p-2 hover:bg-muted cursor-pointer transition-colors",
                    checked && "bg-primary-50/60"
                  )}
                  onClick={() => toggle(b._id)}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(b._id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <BookCover
                    src={b.imageUrl}
                    title={b.title}
                    size="xs"
                    className="w-8 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground line-clamp-1">
                      {b.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {b.author} · {b.category}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary shrink-0">
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
            <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Áp dụng cho
                </p>
                <p className="text-xs text-muted-foreground">
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
                          <SelectItem key={c._id} value={c.slug}>
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
                  <span className="text-sm text-foreground">
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
                loading={createMut.isPending || updateMut.isPending}
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
