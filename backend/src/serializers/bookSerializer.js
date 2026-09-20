// Fields that exist on Book but must never reach a public (customer) response.
// Kept as a denylist rather than an allowlist so that promotion-computed fields
// (originalPrice, discountPercent, activePromotion) and future customer-facing
// columns flow through without touching this file, while anything commercially
// sensitive has to be added here deliberately.
const INTERNAL_BOOK_FIELDS = [
  "costPrice",
  "lastPurchasePrice",
  "defaultSupplier",
  "reorderPoint",
  "reorderQuantity",
  // Warehouse-side split of the stock figure. Customers only ever need the
  // sellable `stock`; how much of the shelf is spoken for is internal.
  "reserved",
  "onHand",
  "lastCountedAt",
  "lowStockAlertedAt",
  "ratingSum",
  "ratingAggregateVersion",
  "searchScore",
  // Internal marker set when a listing was already priced during sorting.
  "__decorated",
  "__v",
];

/**
 * Strip internal/inventory fields from a single book.
 *
 * Accepts a mongoose document, a lean object, or an object already decorated by
 * Promotion.decorateBooks, and always returns a plain object carrying both
 * `_id` and `id` so existing clients keep working.
 */
function toPublicBook(book) {
  if (!book) return book;
  const obj = typeof book.toObject === "function" ? book.toObject() : { ...book };

  for (const field of INTERNAL_BOOK_FIELDS) {
    delete obj[field];
  }

  if (obj._id !== undefined && obj.id === undefined) {
    obj.id = obj._id;
  }

  return obj;
}

function toPublicBooks(books) {
  if (!Array.isArray(books)) return books;
  return books.map(toPublicBook);
}

module.exports = {
  INTERNAL_BOOK_FIELDS,
  toPublicBook,
  toPublicBooks,
};
