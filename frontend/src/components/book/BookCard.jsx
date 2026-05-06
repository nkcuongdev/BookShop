import { Link } from "react-router-dom";
import { Heart, ShoppingCart, Star, Eye, TrendingUp, Sparkles } from "lucide-react";
import { useCart } from "@/context/CartContext.jsx";
import { useAuth } from "@/context/AuthContext.jsx";
import useWishlist from "@/hooks/useWishlist";
import { formatVND, formatCompact, getPriceInfo } from "@/utils/format";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const { addItem } = useCart();
  const { user } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const bookId = book._id || book.id;
  const { price, originalPrice, discountPercent } = getPriceInfo(book);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(book, 1);
    toast.success("Đã thêm vào giỏ hàng", {
      description: book.title,
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

  const outOfStock = book.stock === 0;
  const wished = isWishlisted(bookId);

  return (
    <Link
      to={`/books/${bookId}`}
      className={cn(
        "group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col cursor-pointer border border-gray-100",
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
        <img
          src={book.imageUrl}
          alt={book.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Top-left badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
          {discountPercent > 0 && (
            <Badge variant="sale" className="text-[11px] px-2 py-0.5">
              -{discountPercent}%
            </Badge>
          )}
          {badge === "bestseller" && (
            <Badge variant="bestseller" className="text-[11px]">
              <TrendingUp className="w-3 h-3" />
              Bán chạy
            </Badge>
          )}
          {badge === "new" && (
            <Badge variant="new" className="text-[11px]">
              <Sparkles className="w-3 h-3" />
              Mới
            </Badge>
          )}
        </div>

        {/* Top-right: rank & wishlist */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
          {rank && (
            <div className="w-8 h-8 bg-secondary-900/80 backdrop-blur-sm text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md">
              #{rank}
            </div>
          )}
          <button
            onClick={handleToggleWishlist}
            aria-label="Yêu thích"
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm shadow-md transition-all hover:scale-110",
              wished
                ? "bg-red-500 text-white"
                : "bg-white/90 text-secondary-600 hover:text-red-500"
            )}
          >
            <Heart className={cn("w-4 h-4", wished && "fill-current")} />
          </button>
        </div>

        {/* Out of stock overlay */}
        {outOfStock && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center">
            <Badge variant="secondary" className="text-xs">
              Hết hàng
            </Badge>
          </div>
        )}

        {/* Hover action buttons */}
        {!outOfStock && (
          <div className="absolute bottom-3 left-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300">
            <Button
              onClick={handleAddToCart}
              size="sm"
              className="flex-1 h-9 text-xs"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Thêm giỏ
            </Button>
            {onQuickView && (
              <Button
                onClick={handleQuickView}
                size="icon"
                variant="secondary"
                className="h-9 w-9 shrink-0 bg-white/95 hover:bg-white"
                aria-label="Xem nhanh"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex-1 flex flex-col">
        <h3 className="font-semibold text-secondary-800 text-sm line-clamp-2 group-hover:text-primary-600 transition-colors min-h-[2.5rem]">
          {book.title}
        </h3>
        <p className="text-secondary-500 text-xs mt-1 line-clamp-1">
          {book.author}
        </p>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-2">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="text-xs font-semibold text-secondary-700">
            {Number(book.rating || 0).toFixed(1)}
          </span>
          <span className="text-xs text-secondary-400">
            ({book.reviewCount || 0})
          </span>
        </div>

        {/* Price */}
        <div className="mt-auto pt-2.5 flex items-end justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-base font-bold text-primary-600 leading-tight">
              {formatVND(price)}
            </span>
            {originalPrice && (
              <span className="text-xs text-secondary-400 line-through">
                {formatVND(originalPrice)}
              </span>
            )}
          </div>
          {(book.sold || book.soldCount) > 0 && (
            <span className="text-[11px] text-secondary-400 shrink-0">
              Đã bán {formatCompact(book.sold || book.soldCount)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
