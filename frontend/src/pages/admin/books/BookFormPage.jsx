import { useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { FormProvider, useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Save,
  X,
  Plus,
  Trash2,
  BookOpen,
  Package,
  Image as ImageIcon,
  Tags as TagsIcon,
  Ruler,
  Settings2,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { FormField } from "@/components/admin/common/FormField";
import { ImageUploader } from "@/components/admin/common/ImageUploader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bookSchema, bookDefaults } from "@/features/admin/books/schema";
import {
  useBook,
  useCreateBook,
  useUpdateBook,
} from "@/features/admin/books/hooks";
import { useCategories } from "@/features/admin/categories/hooks";

// Map legacy status values into the new active/inactive world.
function normalizeStatus(v) {
  if (v === "inactive" || v === "draft") return "inactive";
  return "active";
}

function toDateInput(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function BookFormPage({ mode = "create" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const bookQ = useBook(isEdit ? id : null);
  const categoriesQ = useCategories();
  const createMut = useCreateBook();
  const updateMut = useUpdateBook();

  const methods = useForm({
    resolver: zodResolver(bookSchema),
    defaultValues: bookDefaults,
    mode: "onBlur",
  });

  const galleryArr = useFieldArray({ control: methods.control, name: "gallery" });
  const attributesArr = useFieldArray({
    control: methods.control,
    name: "attributes",
  });

  useEffect(() => {
    if (isEdit && bookQ.data) {
      const b = bookQ.data;
      const cat = categoriesQ.data?.find(
        (c) => c.slug === b.category || c._id === b.category
      );
      methods.reset({
        title: b.title || "",
        author: b.author || "",
        price: b.price || 0,
        stock: b.stock || 0,
        categoryId: cat?.slug || b.category || "",
        description: b.description || "",
        imageUrl: b.imageUrl || "",
        status: normalizeStatus(b.status),

        publisher: b.publisher || "",
        publishedDate: toDateInput(b.publishedDate),
        isbn: b.isbn || "",
        pages: b.pages ?? null,
        language: b.language || "",

        weight: b.weight ?? null,
        dimensions: {
          length: b.dimensions?.length ?? null,
          width: b.dimensions?.width ?? null,
          height: b.dimensions?.height ?? null,
        },

        tags: Array.isArray(b.tags) ? b.tags : [],
        gallery: Array.isArray(b.gallery) ? b.gallery : [],
        attributes: Array.isArray(b.attributes) ? b.attributes : [],
      });
    }
  }, [isEdit, bookQ.data, categoriesQ.data, methods]);

  const onSubmit = methods.handleSubmit(async (values) => {
    const payload = {
      title: values.title,
      author: values.author,
      price: values.price,
      stock: values.stock,
      category: values.categoryId,
      description: values.description,
      imageUrl: values.imageUrl,
      status: values.status,

      publisher: values.publisher,
      publishedDate: values.publishedDate || null,
      isbn: values.isbn,
      pages: values.pages,
      language: values.language,

      weight: values.weight,
      dimensions: values.dimensions,

      tags: values.tags,
      gallery: values.gallery,
      attributes: (values.attributes || []).filter((a) => a.key?.trim()),
    };

    if (isEdit) {
      await updateMut.mutateAsync({ id, data: payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    navigate("/admin/books");
  });

  const submitting = createMut.isPending || updateMut.isPending;
  const imageUrl = methods.watch("imageUrl");

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} className="space-y-6">
        <PageHeader
          title={isEdit ? "Chỉnh sửa sách" : "Thêm sách mới"}
          description={
            isEdit
              ? "Cập nhật thông tin sản phẩm"
              : "Điền thông tin để tạo sản phẩm mới"
          }
          breadcrumb={
            <Link
              to="/admin/books"
              className="inline-flex items-center gap-1 text-xs text-secondary-500 hover:text-secondary-800"
            >
              <ArrowLeft className="h-3 w-3" />
              Quay lại danh sách
            </Link>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin/books")}
              >
                <X className="h-4 w-4" />
                Huỷ
              </Button>
              <Button type="submit" disabled={submitting}>
                <Save className="h-4 w-4" />
                {submitting ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          }
        />

        {isEdit && bookQ.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* LEFT COLUMN */}
            <div className="space-y-6 xl:col-span-2">
              <SectionCard
                title="Thông tin cơ bản"
                description="Các trường bắt buộc để tạo sách."
                icon={BookOpen}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField name="title" label="Tên sách" required>
                    {(field) => (
                      <Input placeholder="Ví dụ: Đắc nhân tâm" {...field} />
                    )}
                  </FormField>
                  <FormField name="author" label="Tác giả" required>
                    {(field) => (
                      <Input placeholder="Ví dụ: Dale Carnegie" {...field} />
                    )}
                  </FormField>
                </div>
                <FormField
                  name="description"
                  label="Mô tả"
                  className="mt-4"
                  description="Mô tả ngắn hiển thị ở trang chi tiết sách."
                >
                  {(field) => (
                    <Textarea rows={5} placeholder="Mô tả sản phẩm..." {...field} />
                  )}
                </FormField>
              </SectionCard>

              <SectionCard
                title="Giá & tồn kho"
                description="Thông tin bán hàng."
                icon={Package}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <FormField name="price" label="Giá (VNĐ)" required>
                    {(field) => <Input type="number" min={0} {...field} />}
                  </FormField>
                  <FormField name="stock" label="Tồn kho" required>
                    {(field) => <Input type="number" min={0} {...field} />}
                  </FormField>
                  <FormField name="status" label="Trạng thái">
                    {(field) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Đang bán</SelectItem>
                          <SelectItem value="inactive">Ngừng bán</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                </div>
              </SectionCard>

              <SectionCard
                title="Thông tin xuất bản"
                description="Không bắt buộc – điền nếu có."
                icon={BookOpen}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField name="publisher" label="Nhà xuất bản">
                    {(field) => (
                      <Input placeholder="Ví dụ: NXB Trẻ" {...field} />
                    )}
                  </FormField>
                  <FormField name="publishedDate" label="Ngày xuất bản">
                    {(field) => (
                      <Input type="date" {...field} value={field.value || ""} />
                    )}
                  </FormField>
                  <FormField name="isbn" label="ISBN">
                    {(field) => (
                      <Input placeholder="978-604-..." {...field} />
                    )}
                  </FormField>
                  <FormField name="pages" label="Số trang">
                    {(field) => (
                      <Input
                        type="number"
                        min={0}
                        placeholder="vd: 320"
                        {...field}
                        value={field.value ?? ""}
                      />
                    )}
                  </FormField>
                  <FormField name="language" label="Ngôn ngữ">
                    {(field) => (
                      <Input placeholder="vd: Tiếng Việt" {...field} />
                    )}
                  </FormField>
                </div>
              </SectionCard>

              <SectionCard
                title="Thông số vật lý"
                description="Giúp tính phí vận chuyển chính xác (không bắt buộc)."
                icon={Ruler}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <FormField name="weight" label="Cân nặng (g)">
                    {(field) => (
                      <Input
                        type="number"
                        min={0}
                        placeholder="vd: 350"
                        {...field}
                        value={field.value ?? ""}
                      />
                    )}
                  </FormField>
                  <FormField name="dimensions.length" label="Dài (cm)">
                    {(field) => (
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        {...field}
                        value={field.value ?? ""}
                      />
                    )}
                  </FormField>
                  <FormField name="dimensions.width" label="Rộng (cm)">
                    {(field) => (
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        {...field}
                        value={field.value ?? ""}
                      />
                    )}
                  </FormField>
                  <FormField name="dimensions.height" label="Dày (cm)">
                    {(field) => (
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        {...field}
                        value={field.value ?? ""}
                      />
                    )}
                  </FormField>
                </div>
              </SectionCard>

              <SectionCard
                title="Thuộc tính tuỳ chỉnh"
                description="Thêm các cặp key-value tuỳ ý (ví dụ: Bìa cứng, Phiên bản đặc biệt...)."
                icon={Settings2}
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => attributesArr.append({ key: "", value: "" })}
                  >
                    <Plus className="h-4 w-4" />
                    Thêm thuộc tính
                  </Button>
                }
              >
                {attributesArr.fields.length === 0 ? (
                  <p className="text-sm text-secondary-500">
                    Chưa có thuộc tính nào. Nhấn "Thêm thuộc tính" để bắt đầu.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {attributesArr.fields.map((f, index) => (
                      <div
                        key={f.id}
                        className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]"
                      >
                        <FormField
                          name={`attributes.${index}.key`}
                          label={index === 0 ? "Tên thuộc tính" : undefined}
                        >
                          {(field) => (
                            <Input placeholder="vd: Loại bìa" {...field} />
                          )}
                        </FormField>
                        <FormField
                          name={`attributes.${index}.value`}
                          label={index === 0 ? "Giá trị" : undefined}
                        >
                          {(field) => (
                            <Input placeholder="vd: Bìa mềm" {...field} />
                          )}
                        </FormField>
                        <div className={index === 0 ? "md:pt-7" : ""}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => attributesArr.remove(index)}
                            aria-label="Xoá thuộc tính"
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-6">
              <SectionCard title="Ảnh bìa" icon={ImageIcon}>
                <FormField name="imageUrl" label="Thumbnail">
                  {(field) => (
                    <ImageUploader
                      value={field.value || imageUrl}
                      onChange={(v) => field.onChange(v)}
                    />
                  )}
                </FormField>
              </SectionCard>

              <SectionCard
                title="Thư viện ảnh"
                description="Ảnh phụ hiển thị ở trang chi tiết."
                icon={ImageIcon}
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => galleryArr.append("")}
                  >
                    <Plus className="h-4 w-4" />
                    Thêm ảnh
                  </Button>
                }
              >
                {galleryArr.fields.length === 0 ? (
                  <p className="text-sm text-secondary-500">
                    Chưa có ảnh phụ nào.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {galleryArr.fields.map((f, index) => (
                      <div key={f.id} className="space-y-2">
                        <FormField name={`gallery.${index}`}>
                          {(field) => (
                            <ImageUploader
                              value={field.value}
                              onChange={(v) => field.onChange(v)}
                            />
                          )}
                        </FormField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full text-rose-600 hover:text-rose-700"
                          onClick={() => galleryArr.remove(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Xoá
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Phân loại" icon={TagsIcon}>
                <FormField name="categoryId" label="Danh mục" required>
                  {(field) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn danh mục" />
                      </SelectTrigger>
                      <SelectContent>
                        {(categoriesQ.data || []).map((c) => (
                          <SelectItem key={c._id} value={c.slug}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>

                <FormField
                  name="tags"
                  label="Tags"
                  className="mt-4"
                  description="Nhập tags cách nhau bằng dấu phẩy."
                >
                  {(field) => (
                    <Input
                      placeholder="vd: bestseller, mới, giảm giá"
                      value={
                        Array.isArray(field.value) ? field.value.join(", ") : ""
                      }
                      onChange={(e) =>
                        field.onChange(
                          e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  )}
                </FormField>
              </SectionCard>
            </div>
          </div>
        )}
      </form>
    </FormProvider>
  );
}
