import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { formatVND } from "@/utils/format.js";
import BookCover from "@/components/book/BookCover";

function getBookId(item) {
  return item?.book?._id || item?.book || item?.bookId || "";
}

export default function OrderItemsList({ items = [] }) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold text-foreground text-sm mb-4">
        Sản phẩm ({items.length})
      </h3>

      <ul className="divide-y divide-border">
        {items.map((item, idx) => {
          const bookId = getBookId(item);
          const lineTotal = item.subtotal ?? item.price * item.quantity;

          return (
            <li key={bookId || idx} className="py-3 first:pt-0 last:pb-0">
              <div className="flex gap-3">
                <Link
                  to={bookId ? `/books/${bookId}` : "#"}
                  className="shrink-0 group"
                  aria-label={item.title}
                >
                  <BookCover
                    src={item.imageUrl}
                    title={item.title}
                    size="md"
                    zoomOnHover
                    className="shadow-xs"
                  />
                </Link>

                <div className="flex-1 min-w-0">
                  <Link
                    to={bookId ? `/books/${bookId}` : "#"}
                    className="font-medium text-foreground hover:text-primary transition-colors line-clamp-2 text-sm"
                  >
                    {item.title}
                  </Link>
                  {item.author && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.author}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {formatVND(item.price)} × {item.quantity}
                    </p>
                    <p className="text-sm font-semibold text-primary">
                      {formatVND(lineTotal)}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
