const Book = require("../models/Book");
const User = require("../models/User");
const notificationService = require("./notificationService");

/**
 * Notify everyone who wishlisted a book that it is available again.
 *
 * Only fires on the 0 -> positive transition, so a restock from 3 to 8 stays
 * quiet; the alert is about availability, not quantity.
 *
 * Errors are swallowed: a failed notification must never roll back the stock
 * movement that triggered it.
 */
async function notifyBackInStock({ bookId, stockBefore, stockAfter }, appOrReq = null) {
  if (Number(stockBefore) > 0 || Number(stockAfter) <= 0) return 0;

  try {
    const book = await Book.findById(bookId).select("title status stock").lean();
    if (!book || book.status !== "active" || Number(book.stock) <= 0) return 0;

    const watchers = await User.find({ wishlist: bookId, status: "active" })
      .select("_id")
      .lean();
    if (!watchers.length) return 0;

    await Promise.allSettled(
      watchers.map((watcher) =>
        notificationService.notifyUser(
          watcher._id,
          {
            type: "stock",
            title: "S\u00e1ch \u0111\u00e3 c\u00f3 h\u00e0ng tr\u1edf l\u1ea1i",
            message: `${book.title} hi\u1ec7n \u0111\u00e3 c\u00f3 th\u1ec3 \u0111\u1eb7t mua.`,
            link: `/books/${bookId}`,
            metadata: { bookId, stock: stockAfter },
          },
          appOrReq
        )
      )
    );
    return watchers.length;
  } catch (error) {
    console.error("[restockAlert] Failed to notify watchers:", error.message);
    return 0;
  }
}

module.exports = { notifyBackInStock };
