import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Pencil,
  BookOpen,
  Package,
  Calendar,
  Languages,
  Hash,
  FileText,
  Ruler,
  Weight,
  Star,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/common/StatusBadge";
import { useBook } from "@/features/admin/books/hooks";
import { formatVND } from "@/utils/format";

function stockStatus(n = 0) {
  if (n <= 0) return "out_of_stock";
  if (n < 10) return "low_stock";
  return "in_stock";
}

function formatDate(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("vi-VN");
}

function isPdfUrl(url = "") {
  return /\.pdf(\?|$)/i.test(url);
}

function InfoRow({ icon: Icon, label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      {Icon && (
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary-400" />
      )}
      <span className="w-28 shrink-0 text-secondary-500">{label}</span>
      <span className="font-medium text-secondary-800">{value}</span>
    </div>
  );
}

export function BookPreviewSheet({
  bookId,
  fallbackBook,
  open,
  onOpenChange,
  categoryByKey,
}) {
  // When the sheet opens we may already have the row data (fallbackBook);
  // also fetch the full doc so we show gallery/attributes/isbn etc.
  const bookQ = useBook(open ? bookId : null);
  const book = bookQ.data || fallbackBook || null;

  const images = useMemo(() => {
    if (!book) return [];
    const list = [book.imageUrl, ...(book.gallery || [])].filter(Boolean);
    return Array.from(new Set(list));
  }, [book]);

  const [activeImg, setActiveImg] = useState(0);
  useEffect(() => {
    setActiveImg(0);
  }, [bookId, open]);

  const cat = book ? categoryByKey?.get(book.category) : null;
  const loading = bookQ.isLoading && !fallbackBook;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader className="pr-8">
          <SheetTitle>Xem nhanh sách</SheetTitle>
          <SheetDescription>
            Thông tin chi tiết sản phẩm ở chế độ chỉ đọc.
          </SheetDescription>
        </SheetHeader>

        {loading || !book ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Gallery */}
            <div className="space-y-2">
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                {images[activeImg] ? (
                  <img
                    src={images[activeImg]}
                    alt={book.title}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <BookOpen className="h-10 w-10 text-secondary-300" />
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((src, idx) => (
                    <button
                      key={src + idx}
                      type="button"
                      onClick={() => setActiveImg(idx)}
                      className={`h-16 w-12 shrink-0 overflow-hidden rounded border-2 transition ${
                        idx === activeImg
                          ? "border-primary-500"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title block */}
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">
                {book.title}
              </h3>
              <p className="text-sm text-secondary-500">{book.author}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xl font-bold text-primary-600">
                  {formatVND(book.price)}
                </span>
                {cat && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {cat.name}
                  </span>
                )}
                <StatusBadge status={stockStatus(book.stock || 0)} />
                {book.status === "inactive" && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    Ngừng bán
                  </span>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                icon={Package}
                label="Tồn kho"
                value={book.stock ?? 0}
              />
              <StatTile
                icon={ShoppingBag}
                label="Đã bán"
                value={book.sold ?? 0}
              />
              <StatTile
                icon={Star}
                label="Đánh giá"
                value={`${book.rating ?? 0} (${book.reviewCount ?? 0})`}
              />
            </div>

            {/* Description */}
            {book.description && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-secondary-800">
                  Mô tả
                </h4>
                <p className="whitespace-pre-line text-sm leading-relaxed text-secondary-600">
                  {book.description}
                </p>
              </section>
            )}

            {/* Publishing / physical details */}
            <section className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
              <h4 className="mb-2 text-sm font-semibold text-secondary-800">
                Thông tin chi tiết
              </h4>
              <div className="divide-y divide-gray-100">
                <InfoRow
                  icon={BookOpen}
                  label="Nhà xuất bản"
                  value={book.publisher}
                />
                <InfoRow
                  icon={Calendar}
                  label="Ngày XB"
                  value={formatDate(book.publishedDate)}
                />
                <InfoRow icon={Hash} label="ISBN" value={book.isbn} />
                <InfoRow icon={FileText} label="Số trang" value={book.pages} />
                <InfoRow
                  icon={Languages}
                  label="Ngôn ngữ"
                  value={book.language}
                />
                <InfoRow
                  icon={Weight}
                  label="Cân nặng"
                  value={book.weight ? `${book.weight} g` : null}
                />
                <InfoRow
                  icon={Ruler}
                  label="Kích thước"
                  value={formatDimensions(book.dimensions)}
                />
              </div>
            </section>

            {/* Tags */}
            {Array.isArray(book.tags) && book.tags.length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-secondary-800">
                  Tags
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {book.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-secondary-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Custom attributes */}
            {Array.isArray(book.attributes) && book.attributes.length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-secondary-800">
                  Thuộc tính tuỳ chỉnh
                </h4>
                <div className="overflow-hidden rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {book.attributes.map((a, i) => (
                        <tr key={(a.key || "") + i}>
                          <td className="w-1/3 bg-gray-50/60 px-3 py-2 text-secondary-500">
                            {a.key}
                          </td>
                          <td className="px-3 py-2 text-secondary-800">
                            {a.value || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Optional content preview (PDF) */}
            {book.contentUrl && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-secondary-800">
                  Xem trước nội dung
                </h4>
                {isPdfUrl(book.contentUrl) ? (
                  <iframe
                    title="Content preview"
                    src={book.contentUrl}
                    className="h-72 w-full rounded-xl border border-gray-100"
                  />
                ) : (
                  <a
                    href={book.contentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Mở nội dung trong tab mới
                  </a>
                )}
              </section>
            )}

            {/* Footer actions */}
            <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-2 border-t border-gray-100 bg-white/95 px-6 py-3 backdrop-blur">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
              <Button asChild>
                <Link to={`/admin/books/${book._id || book.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Chỉnh sửa
                </Link>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-secondary-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-secondary-900">
        {value}
      </div>
    </div>
  );
}

function formatDimensions(d) {
  if (!d) return null;
  const parts = [d.length, d.width, d.height].filter(
    (n) => n !== null && n !== undefined && n !== ""
  );
  if (parts.length === 0) return null;
  return `${parts.join(" × ")} cm`;
}
