import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { formatVND } from "@/utils/format.js";

function getBookId(item) {
  return item?.book?._id || item?.book || item?.bookId || "";
}

export default function OrderItemsList({ items = [] }) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold text-secondary-800 text-sm mb-4">
        Sản phẩm ({items.length})
      </h3>

      <ul className="divide-y divide-gray-100">
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
                  <img
                    src={item.imageUrl || "https://via.placeholder.com/80x120"}
                    alt={item.title}
                    className="w-16 h-22 object-cover rounded-lg shadow-sm transition-transform group-hover:scale-105"
                    style={{ aspectRatio: "2 / 3" }}
                  />
                </Link>

                <div className="flex-1 min-w-0">
                  <Link
                    to={bookId ? `/books/${bookId}` : "#"}
                    className="font-medium text-secondary-800 hover:text-primary-600 transition-colors line-clamp-2 text-sm"
                  >
                    {item.title}
                  </Link>
                  {item.author && (
                    <p className="text-xs text-secondary-500 mt-0.5">
                      {item.author}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-secondary-500">
                      {formatVND(item.price)} × {item.quantity}
                    </p>
                    <p className="text-sm font-semibold text-primary-600">
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
