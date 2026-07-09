import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingCart, Star, Eye, TrendingUp, Sparkles } from "lucide-react";
import { useCart } from "@/context/CartContext.jsx";
import { useAuth } from "@/context/AuthContext.jsx";
import useWishlist from "@/hooks/useWishlist";
import { formatVND, formatCompact, getPriceInfo } from "@/utils/format";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import BookCover from "@/components/book/BookCover";
/**
 * Unified BookCard — sang modern, hover "float" + quick actions
 * Props:
 *  - book
 *  - badge: "bestseller" | "new" | "sale"
 *  - rank: number (top #)
 *  - onQuickView: (book) => void
 */
export default function BookCard({
  book,
  badge = null,
  rank = null,
  onQuickView,
  className,
}) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { user } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const bookId = book._id || book.id;
  const { price, originalPrice, discountPercent } = getPriceInfo(book);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const result = addItem(book, 1);
    if (!result?.success) {
      toast.error("Số lượng trong giỏ đã đạt mức còn hàng");
      return;
    }
    toast.success("Đã thêm vào giỏ hàng", {
      description: book.title,
      // The toast was a dead end — no way to act on it. sonner supports an
      // action button and it was unused across all 137 call sites.
      action: {
        label: "Xem giỏ",
        onClick: () => navigate("/cart"),
      },
    });
  };

  const handleToggleWishlist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Vui lòng đăng nhập để lưu yêu thích");
      return;
    }
    const currentlyWished = isWishlisted(bookId);
    const res = await toggle(book);
    if (!res?.success) {
      toast.error(res?.message || "Không thể cập nhật yêu thích");
      return;
    }
    toast.success(
      currentlyWished ? "Đã bỏ khỏi yêu thích" : "Đã thêm vào yêu thích"
    );
  };

  const handleQuickView = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onQuickView?.(book);
  };

  const unavailable = book.status === "inactive";
  const outOfStock = unavailable || Number(book.stock) <= 0;
  const wished = isWishlisted(bookId);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-rest transition-[box-shadow,transform,--tw-ring-color] duration-base ease-out-soft hover:-translate-y-1 hover:ring-foreground/10 hover:shadow-lift",
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden">
        <Link
          to={`/books/${bookId}`}
          className="block h-full rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`Xem chi tiết ${book.title}`}
        >
          <BookCover
            src={book.imageUrl}
            title={book.title}
            size="full"
            zoomOnHover
            className="h-full w-full rounded-none"
          >
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-base group-hover:opacity-100" />
          </BookCover>
        </Link>

        {/* Top-left badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
          {discountPercent > 0 && (
            <Badge variant="sale" className="text-[11px] px-2 py-0.5">
              -{discountPercent}%
            </Badge>
          )}
          {badge === "bestseller" && (
            <Badge variant="bestseller" className="text-[11px]">
              <TrendingUp className="size-3" />
              Bán chạy
            </Badge>
          )}
          {badge === "new" && (
            <Badge variant="new" className="text-[11px]">
              <Sparkles className="size-3" />
              Mới
            </Badge>
          )}
        </div>

        {/* Top-right: rank & wishlist */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
          {rank && (
            <div className="size-8 bg-foreground/80 backdrop-blur-sm text-background rounded-full flex items-center justify-center font-bold text-sm shadow-xs">
              #{rank}
            </div>
          )}
          <button
            type="button"
            onClick={handleToggleWishlist}
            aria-label="Yêu thích"
            className={cn(
              "size-8 rounded-full flex items-center justify-center backdrop-blur-sm shadow-xs transition-all hover:scale-110",
              wished
                ? "bg-danger-strong text-white"
                : "bg-card/90 text-muted-foreground hover:text-danger-strong"
            )}
          >
            <Heart className={cn("size-4", wished && "fill-current")} />
          </button>
        </div>

        {/* Out of stock overlay */}
        {outOfStock && (
          <div className="absolute inset-0 bg-card/85 backdrop-blur-sm flex items-center justify-center">
            <Badge variant="secondary" className="text-xs">
              {unavailable ? "Ngừng bán" : "Hết hàng"}
            </Badge>
          </div>
        )}

        {/* Quick actions.
            Was `group-hover` only, which made "Thêm giỏ" unreachable on touch
            devices — they have no hover. Now visible by default below lg, and
            reveal-on-hover (plus focus-within, for keyboards) from lg up. */}
        {!outOfStock && (
          <div className="absolute inset-x-3 bottom-3 flex gap-2 transition-[opacity,transform] duration-base ease-out-soft lg:translate-y-4 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:group-focus-within:translate-y-0 lg:group-focus-within:opacity-100">
            <Button
              onClick={handleAddToCart}
              size="sm"
              className="flex-1 h-9 text-xs"
            >
              <ShoppingCart className="size-4" />
              Thêm giỏ
            </Button>
            {onQuickView && (
              <Button
                onClick={handleQuickView}
                size="icon"
                variant="secondary"
                className="size-9 shrink-0 bg-card/95 hover:bg-card"
                aria-label="Xem nhanh"
              >
                <Eye className="size-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex-1 flex flex-col">
        <Link
          to={`/books/${bookId}`}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <h3 className="font-semibold text-foreground text-sm line-clamp-2 group-hover:text-primary transition-colors min-h-[2.5rem]">
            {book.title}
          </h3>
        </Link>
        <p className="text-muted-foreground text-xs mt-1 line-clamp-1">
          {book.author}
        </p>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-2">
          <Star className="size-4 fill-warning text-warning" />
          <span className="text-xs font-semibold text-foreground">
            {Number(book.rating || 0).toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground/70">
            ({book.reviewCount || 0})
          </span>
        </div>

        {/* Price */}
        <div className="mt-auto pt-2.5 flex items-end justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-base font-bold text-primary leading-tight">
              {formatVND(price)}
            </span>
            {originalPrice && (
              <span className="text-xs text-muted-foreground/70 line-through">
                {formatVND(originalPrice)}
              </span>
            )}
          </div>
          {(book.sold || book.soldCount) > 0 && (
            <span className="text-[11px] text-muted-foreground/70 shrink-0">
              Đã bán {formatCompact(book.sold || book.soldCount)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
