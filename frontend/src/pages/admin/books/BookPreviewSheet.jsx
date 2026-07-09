import { useState, useMemo } from "react";
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

function formatYear(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear();
}

function isPdfUrl(url = "") {
  return /\.pdf(\?|$)/i.test(url);
}

function InfoRow({ icon: Icon, label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      {Icon && (
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
      )}
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
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

  const [imageSelection, setImageSelection] = useState({ bookId: null, index: 0 });
  const activeImg = imageSelection.bookId === bookId ? imageSelection.index : 0;

  const cat = book ? categoryByKey?.get(book.category) : null;
  const loading = bookQ.isLoading && !fallbackBook;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 px-6 pb-5 pt-6 pr-12">
          <SheetTitle>Xem nhanh sách</SheetTitle>
          <SheetDescription>
            Thông tin chi tiết sản phẩm ở chế độ chỉ đọc.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {loading || !book ? (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
            {/* Gallery */}
            <div className="space-y-2">
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
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
                  <BookOpen className="size-10 text-muted-foreground/60" />
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((src, idx) => (
                    <button
                      key={src + idx}
                      type="button"
                      onClick={() => setImageSelection({ bookId, index: idx })}
                      className={`h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                        idx === activeImg
                          ? "border-primary"
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
              <h3 className="text-h3 font-semibold text-foreground">
                {book.title}
              </h3>
              <p className="text-sm text-muted-foreground">{book.author}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xl font-bold text-primary">
                  {formatVND(book.price)}
                </span>
                {cat && (
                  <span className="inline-flex items-center rounded-full bg-info-muted px-2.5 py-0.5 text-xs font-medium text-info-strong">
                    {cat.name}
                  </span>
                )}
                <StatusBadge status={stockStatus(book.stock || 0)} />
                {book.status === "inactive" && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
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
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Mô tả
                </h4>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {book.description}
                </p>
              </section>
            )}

            {/* Publishing / physical details */}
            <section className="rounded-xl border border-border bg-muted/50 p-4">
              <h4 className="mb-2 text-sm font-semibold text-foreground">
                Thông tin chi tiết
              </h4>
              <div className="divide-y divide-border">
                <InfoRow
                  icon={BookOpen}
                  label="Nhà xuất bản"
                  value={book.publisher}
                />
                <InfoRow
                  icon={Calendar}
                  label="Năm XB"
                  value={formatYear(book.publishedDate)}
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
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Tags
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {book.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground"
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
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Thuộc tính tuỳ chỉnh
                </h4>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {book.attributes.map((a, i) => (
                        <tr key={(a.key || "") + i}>
                          <td className="w-1/3 bg-muted/60 px-3 py-2 text-muted-foreground">
                            {a.key}
                          </td>
                          <td className="px-3 py-2 text-foreground">
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
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Xem trước nội dung
                </h4>
                {isPdfUrl(book.contentUrl) ? (
                  <iframe
                    title="Content preview"
                    src={book.contentUrl}
                    className="h-72 w-full rounded-xl border border-border"
                  />
                ) : (
                  <a
                    href={book.contentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-4" />
                    Mở nội dung trong tab mới
                  </a>
                )}
              </section>
            )}

            </div>
          )}
        </div>

        {!loading && book && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            <Button asChild>
              <Link to={`/admin/books/${book._id || book.id}/edit`}>
                <Pencil className="size-4" />
                Chỉnh sửa
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/[0.08]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="size-4" />}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">
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
