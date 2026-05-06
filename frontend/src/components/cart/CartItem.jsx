import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import QuantityInput from "@/components/common/QuantityInput";
import { formatVND, getPriceInfo } from "@/utils/format";
import { Button } from "@/components/ui/button";

export default function CartItem({ item, onUpdateQty, onRemove }) {
  const { book, quantity } = item;
  const bookId = book._id || book.id;
  const { price, originalPrice } = getPriceInfo(book);
  const lineTotal = price * quantity;

  return (
    <div className="flex gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
      <Link to={`/books/${bookId}`} className="shrink-0">
        <img
          src={book.imageUrl}
          alt={book.title}
          className="w-20 h-28 sm:w-24 sm:h-32 object-cover rounded-xl bg-gray-100"
        />
      </Link>
      <div className="flex-1 min-w-0 flex flex-col">
        <Link
          to={`/books/${bookId}`}
          className="font-semibold text-secondary-800 line-clamp-2 hover:text-primary-600 transition-colors text-sm sm:text-base"
        >
          {book.title}
        </Link>
        <p className="text-xs sm:text-sm text-secondary-500 mt-0.5">
          {book.author}
        </p>

        <div className="flex items-baseline gap-2 mt-2">
          <span className="font-bold text-primary-600">
            {formatVND(price)}
          </span>
          {originalPrice && originalPrice > price && (
            <span className="text-xs text-secondary-400 line-through">
              {formatVND(originalPrice)}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 mt-auto pt-3">
          <QuantityInput
            value={quantity}
            onChange={(v) => onUpdateQty(bookId, v)}
            size="sm"
            max={book.stock || 99}
          />
          <div className="text-right">
            <p className="text-[11px] text-secondary-400">Thành tiền</p>
            <p className="font-bold text-secondary-800">
              {formatVND(lineTotal)}
            </p>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(bookId)}
        className="text-secondary-400 hover:text-red-500 hover:bg-red-50 shrink-0"
        aria-label="Xóa"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
