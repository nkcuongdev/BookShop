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
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { SectionCard } from "@/components/admin/common/SectionCard";
import { FormField } from "@/components/admin/common/FormField";
import { ImageUploader } from "@/components/admin/common/ImageUploader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bookSchemaFor,
  bookDefaults,
  publishedDateToYear,
  publishedYearToDate,
} from "@/features/admin/books/schema";
import {
  useBook,
  useCreateBook,
  useUpdateBook,
} from "@/features/admin/books/hooks";
import { useCategories } from "@/features/admin/categories/hooks";
import { useSuppliers } from "@/features/admin/suppliers/hooks";
import { useAuth } from "@/context/AuthContext.jsx";
import { can } from "@/lib/rbac";

// Map legacy status values into the new active/inactive world.
function normalizeStatus(v) {
  if (v === "inactive" || v === "draft") return "inactive";
  return "active";
}

export default function BookFormPage({ mode = "create" }) {
  const { user } = useAuth();
  const canUpload = can(user, "upload.admin");
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const bookQ = useBook(isEdit ? id : null);
  const categoriesQ = useCategories();
  const suppliersQ = useSuppliers({ status: "active", limit: 100 });
  const createMut = useCreateBook();
  const updateMut = useUpdateBook();

  const methods = useForm({
    // Editing omits `stock` entirely — the server rejects it, because stock is
    // owned by the inventory ledger once the book exists.
    resolver: zodResolver(bookSchemaFor(mode)),
    defaultValues: bookDefaults,
    mode: "onBlur",
  });

  const galleryArr = useFieldArray({ control: methods.control, name: "gallery" });
  const attributesArr = useFieldArray({
    control: methods.control,
    name: "attributes",
  });
  const contributorsArr = useFieldArray({
    control: methods.control,
    name: "contributors",
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
        contributors: (b.contributors || []).filter((entry, index) =>
          !(index === 0 && entry.role === "author" && entry.name === b.author)
        ),
        price: b.price ?? "",
        stock: b.stock ?? "",
        categoryId: cat?.slug || b.category || "",
        description: b.description || "",
        imageUrl: b.imageUrl || "",
        status: normalizeStatus(b.status),

        publisher: b.publisher || "",
        publishedYear: publishedDateToYear(b.publishedDate),
        isbn: b.isbn || "",
        editionGroup: String(b.editionGroup?._id || b.editionGroup || ""),
        edition: {
          number: b.edition?.number ?? 1,
          label: b.edition?.label || "",
          format: b.edition?.format || "paperback",
        },
        pages: b.pages ?? null,
        language: b.language || "",

        weight: b.weight ?? null,
        dimensions: {
          length: b.dimensions?.length ?? null,
          width: b.dimensions?.width ?? null,
          height: b.dimensions?.height ?? null,
        },

        reorderPoint: b.reorderPoint ?? 0,
        reorderQuantity: b.reorderQuantity ?? 0,
        defaultSupplier: String(b.defaultSupplier?._id || b.defaultSupplier || ""),

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
      contributors: values.contributors,
      price: values.price,
      category: values.categoryId,
      description: values.description,
      imageUrl: values.imageUrl,
      status: values.status,

      publisher: values.publisher,
      publishedDate: publishedYearToDate(values.publishedYear),
      isbn: values.isbn,
      editionGroup: values.editionGroup || null,
      edition: values.edition,
      pages: values.pages,
      language: values.language,

      weight: values.weight,
      dimensions: values.dimensions,

      reorderPoint: values.reorderPoint,
      reorderQuantity: values.reorderQuantity,
      defaultSupplier: values.defaultSupplier || null,

      tags: values.tags,
      gallery: values.gallery,
      attributes: (values.attributes || []).filter((a) => a.key?.trim()),
    };

    if (isEdit) {
      await updateMut.mutateAsync({ id, data: payload });
    } else {
      // Opening stock is set once, at creation.
      await createMut.mutateAsync({ ...payload, stock: values.stock });
    }
    navigate("/admin/books");
  });

  const submitting = createMut.isPending || updateMut.isPending;
  // React Hook Form owns this subscription and returns non-memoizable APIs.
  // eslint-disable-next-line react-hooks/incompatible-library
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
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
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
                <X className="size-4" />
                Huỷ
              </Button>
              <Button type="submit" loading={submitting}>
                <Save className="size-4" />
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>Đồng tác giả và vai trò khác</Label>
                      <p className="text-xs text-muted-foreground">
                        Thêm đồng tác giả, dịch giả, biên tập viên hoặc họa sĩ minh họa.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => contributorsArr.append({ name: "", role: "author" })}
                    >
                      <Plus className="size-4" /> Thêm người
                    </Button>
                  </div>
                  {contributorsArr.fields.map((entry, index) => (
                    <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_160px_auto] gap-2">
                      <FormField name={`contributors.${index}.name`} label="Tên" className="space-y-1">
                        {(field) => <Input placeholder="Họ và tên" {...field} />}
                      </FormField>
                      <FormField name={`contributors.${index}.role`} label="Vai trò" className="space-y-1">
                        {(field) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="author">Đồng tác giả</SelectItem>
                              <SelectItem value="translator">Dịch giả</SelectItem>
                              <SelectItem value="editor">Biên tập</SelectItem>
                              <SelectItem value="illustrator">Minh họa</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </FormField>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-6 text-danger-strong"
                        onClick={() => contributorsArr.remove(index)}
                        aria-label="Xóa người đóng góp"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
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
                  {isEdit ? (
                    // Read-only on purpose: stock moves through goods receipts,
                    // issues, stocktakes and adjustments so every change lands
                    // in the ledger.
                    <div className="space-y-1.5">
                      <Label>Tồn kho</Label>
                      <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {bookQ.data?.stock ?? 0}
                        </span>
                        <Link
                          to={`/admin/inventory/ledger`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Lịch sử tồn
                        </Link>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Thay đổi tồn kho qua phiếu nhập, phiếu xuất, kiểm kho
                        hoặc điều chỉnh tồn.
                      </p>
                    </div>
                  ) : (
                    <FormField
                      name="stock"
                      label="Tồn kho ban đầu"
                      required
                      description="Sau khi tạo, tồn kho chỉ đổi qua chứng từ kho."
                    >
                      {(field) => <Input type="number" min={0} {...field} />}
                    </FormField>
                  )}
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
                title="Cài đặt kho"
                description="Ngưỡng cảnh báo và nhà cung cấp mặc định."
                icon={Warehouse}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <FormField
                    name="reorderPoint"
                    label="Ngưỡng tồn tối thiểu"
                    description="Để 0 để dùng ngưỡng mặc định của hệ thống."
                  >
                    {(field) => (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="vd: 10"
                        {...field}
                        value={field.value ?? 0}
                      />
                    )}
                  </FormField>
                  <FormField
                    name="reorderQuantity"
                    label="Số lượng đặt lại"
                    description="Số lượng đề nghị nhập khi tồn xuống thấp."
                  >
                    {(field) => (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="vd: 30"
                        {...field}
                        value={field.value ?? 0}
                      />
                    )}
                  </FormField>
                  <FormField
                    name="defaultSupplier"
                    label="Nhà cung cấp mặc định"
                    description="Dùng để gợi ý khi tạo phiếu nhập."
                  >
                    {(field) => (
                      <Select
                        value={field.value || "none"}
                        onValueChange={(value) =>
                          field.onChange(value === "none" ? "" : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chưa chọn" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Chưa chọn</SelectItem>
                          {(suppliersQ.data?.suppliers || []).map((supplier) => (
                            <SelectItem
                              key={supplier._id}
                              value={String(supplier._id)}
                            >
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                </div>
                {isEdit && bookQ.data?.costPrice > 0 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Giá vốn bình quân hiện tại:{" "}
                    <strong className="text-foreground">
                      {new Intl.NumberFormat("vi-VN").format(bookQ.data.costPrice)} đ
                    </strong>
                    . Giá vốn được tính tự động từ các phiếu nhập đã xác nhận.
                  </p>
                )}
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
                  <FormField name="publishedYear" label="Năm xuất bản">
                    {(field) => (
                      <Input
                        type="number"
                        min={1000}
                        max={new Date().getFullYear()}
                        step={1}
                        placeholder="vd: 2024"
                        {...field}
                        value={field.value || ""}
                      />
                    )}
                  </FormField>
                  <FormField name="isbn" label="ISBN">
                    {(field) => (
                      <Input placeholder="978-604-..." {...field} />
                    )}
                  </FormField>
                  <FormField name="editionGroup" label="Mã nhóm ấn bản">
                    {(field) => (
                      <Input
                        placeholder="Để trống nếu đây là tác phẩm mới"
                        {...field}
                      />
                    )}
                  </FormField>
                  <FormField name="edition.number" label="Lần xuất bản">
                    {(field) => <Input type="number" min={1} {...field} />}
                  </FormField>
                  <FormField name="edition.format" label="Định dạng">
                    {(field) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paperback">Bìa mềm</SelectItem>
                          <SelectItem value="hardcover">Bìa cứng</SelectItem>
                          <SelectItem value="ebook">Sách điện tử</SelectItem>
                          <SelectItem value="audiobook">Sách nói</SelectItem>
                          <SelectItem value="other">Khác</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                  <FormField name="edition.label" label="Tên ấn bản">
                    {(field) => <Input placeholder="Ví dụ: Bản kỷ niệm" {...field} />}
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
                <p className="mt-3 text-xs text-muted-foreground">
                  Khi tạo một ấn bản khác của cùng tác phẩm, nhập mã nhóm ấn bản
                  của bản gốc. Để trống để hệ thống tự tạo nhóm mới.
                </p>
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
                    <Plus className="size-4" />
                    Thêm thuộc tính
                  </Button>
                }
              >
                {attributesArr.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
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
                            <Trash2 className="size-4 text-danger-strong" />
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
                <FormField name="imageUrl" label="Ảnh bìa" required>
                  {(field) => (
                    <ImageUploader
                      value={field.value || imageUrl}
                      onChange={(v) => field.onChange(v)}
                      disabled={!canUpload}
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
                    <Plus className="size-4" />
                    Thêm ảnh
                  </Button>
                }
              >
                {galleryArr.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
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
                              disabled={!canUpload}
                            />
                          )}
                        </FormField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full text-danger-strong hover:text-danger-strong"
                          onClick={() => galleryArr.remove(index)}
                        >
                          <Trash2 className="size-4" />
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
