import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import QuantityInput from "@/components/common/QuantityInput";
import { formatVND, getPriceInfo } from "@/utils/format";
import { Button } from "@/components/ui/button";
import BookCover from "@/components/book/BookCover";

export default function CartItem({ item, onUpdateQty, onRemove }) {
  const { book, quantity } = item;
  const bookId = book._id || book.id;
  const { price, originalPrice } = getPriceInfo(book);
  const lineTotal = price * quantity;
  const stockLimit = Number.isFinite(Number(book.stock))
    ? Math.max(0, Number(book.stock))
    : 99;
  const reasonLabels = {
    not_found: "Sản phẩm không còn tồn tại",
    inactive: "Sản phẩm đã ngừng bán",
    out_of_stock: "Sản phẩm tạm hết hàng",
  };
  const unavailable = item.available === false;

  return (
    <div className="flex gap-4 p-4 bg-card rounded-2xl ring-1 ring-foreground/[0.06] shadow-rest transition-[box-shadow,--tw-ring-color] duration-base ease-out-soft hover:ring-foreground/10 hover:shadow-lift">
      <Link to={`/books/${bookId}`} className="shrink-0">
        <BookCover
          src={book.imageUrl}
          title={book.title}
          size="lg"
          className="w-20 sm:w-24"
        />
      </Link>
      <div className="flex-1 min-w-0 flex flex-col">
        <Link
          to={`/books/${bookId}`}
          className="font-semibold text-foreground line-clamp-2 hover:text-primary transition-colors text-sm sm:text-base"
        >
          {book.title}
        </Link>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          {book.author}
        </p>
        {unavailable && (
          <p className="mt-2 text-sm font-medium text-danger-strong">
            {reasonLabels[item.unavailableReason] || "Sản phẩm hiện không thể mua"}
          </p>
        )}
        {item.adjustment?.reason === "stock_reduced" && (
          <p className="mt-2 text-sm text-warning-strong">
            Số lượng đã giảm từ {item.adjustment.requestedQuantity} xuống {item.quantity} do tồn kho thay đổi.
          </p>
        )}

        <div className="flex items-baseline gap-2 mt-2">
          <span className="font-bold text-primary">
            {formatVND(price)}
          </span>
          {originalPrice && originalPrice > price && (
            <span className="text-xs text-muted-foreground/70 line-through">
              {formatVND(originalPrice)}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 mt-auto pt-3">
          <QuantityInput
            value={quantity}
            onChange={(v) => onUpdateQty(bookId, v)}
            size="sm"
            max={stockLimit}
            disabled={unavailable}
          />
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground/70">Thành tiền</p>
            <p className="font-bold text-foreground">
              {unavailable ? "Không tính" : formatVND(lineTotal)}
            </p>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(bookId)}
        className="text-muted-foreground/70 hover:text-danger-strong hover:bg-danger-muted shrink-0"
        aria-label="Xóa"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
