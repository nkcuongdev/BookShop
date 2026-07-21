// "Mua ngay" bypasses the cart entirely: the chosen book is checked out on its
// own and whatever sits in the cart is left untouched. The selection lives in
// sessionStorage rather than only in router state so a reload of /checkout
// keeps buying the same book instead of silently falling back to the cart.
const BUY_NOW_KEY = "bookshop_buy_now";

const getBookKey = (book) => String(book?._id || book?.id || "");

function normalizeQuantity(quantity) {
  const value = Math.floor(Number(quantity) || 0);
  return value > 0 ? value : 0;
}

export function normalizeBuyNowSelection(raw) {
  const book = raw?.book;
  const quantity = normalizeQuantity(raw?.quantity);
  if (!getBookKey(book) || quantity <= 0) return null;
  return { book, quantity };
}

export function saveBuyNowSelection(book, quantity) {
  const selection = normalizeBuyNowSelection({ book, quantity });
  if (!selection) return null;
  try {
    window.sessionStorage.setItem(
      BUY_NOW_KEY,
      JSON.stringify({
        bookId: getBookKey(selection.book),
        quantity: selection.quantity,
        book: {
          _id: getBookKey(selection.book),
          title: selection.book.title || "",
          author: selection.book.author || "",
          imageUrl: selection.book.imageUrl || "",
          price: Number(selection.book.price) || 0,
          stock: selection.book.stock,
          status: selection.book.status || "active",
        },
      })
    );
  } catch {
    // Router state still carries the selection for this navigation; only the
    // reload-survival convenience is lost.
  }
  return selection;
}

export function readBuyNowSelection() {
  try {
    const stored = window.sessionStorage.getItem(BUY_NOW_KEY);
    if (!stored) return null;
    return normalizeBuyNowSelection(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function clearBuyNowSelection() {
  try {
    window.sessionStorage.removeItem(BUY_NOW_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
