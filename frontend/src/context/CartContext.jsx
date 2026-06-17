import { createContext, useContext, useState, useEffect } from "react";
import { cartAPI } from "@/services/api";
import { authAPI } from "@/services/api";

const CartContext = createContext(null);

const getBookKey = (book) => book?._id || book?.id || null;

const getStockLimit = (book) => {
  const stock = Number(book?.stock);
  return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : Infinity;
};

const normalizeQuantity = (quantity) =>
  Math.max(0, Math.floor(Number(quantity) || 0));

const clampQuantity = (book, quantity) => {
  const normalized = normalizeQuantity(quantity);
  const stockLimit = getStockLimit(book);
  return Number.isFinite(stockLimit)
    ? Math.min(normalized, stockLimit)
    : normalized;
};

function normalizeCartItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  const merged = new Map();
  for (const entry of rawItems) {
    const key = getBookKey(entry?.book);
    const qty = clampQuantity(entry?.book, entry?.quantity);
    if (!key || qty <= 0) continue;

    const prev = merged.get(key);
    if (prev) {
      prev.quantity = clampQuantity(prev.book, prev.quantity + qty);
      continue;
    }
    merged.set(key, { book: entry.book, quantity: qty });
  }
  return Array.from(merged.values()).filter((item) => item.quantity > 0);
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const savedCart = localStorage.getItem("bookshop_cart");
      if (!savedCart) return [];
      return normalizeCartItems(JSON.parse(savedCart));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("bookshop_cart", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    let active = true;

    const syncServerCart = async () => {
      const user = authAPI.getCurrentUser();
      if (!user) {
        setItems([]);
        localStorage.removeItem("bookshop_cart");
        localStorage.removeItem("bookshop_cart_merged_user");
        return;
      }
      try {
        const userId = String(user.id || user._id || "");
        const alreadyMerged =
          localStorage.getItem("bookshop_cart_merged_user") === userId;
        const localItems = normalizeCartItems(
          JSON.parse(localStorage.getItem("bookshop_cart") || "[]")
        );
        const res = localItems.length && !alreadyMerged
          ? await cartAPI.merge(localItems)
          : await cartAPI.get();
        if (!active) return;
        const serverItems = normalizeCartItems(res?.data?.cart?.items || []);
        setItems(serverItems);
        localStorage.setItem("bookshop_cart", JSON.stringify(serverItems));
        if (userId) localStorage.setItem("bookshop_cart_merged_user", userId);
      } catch {
        // Keep local cart as fallback.
      }
    };

    syncServerCart();
    window.addEventListener("bookshop:auth-changed", syncServerCart);
    return () => {
      active = false;
      window.removeEventListener("bookshop:auth-changed", syncServerCart);
    };
  }, []);

  const persistServer = async (operation) => {
    if (!authAPI.getCurrentUser()) return;
    try {
      await operation();
    } catch {
      // Local optimistic state remains usable if the server is temporarily unavailable.
    }
  };

  const addItem = (book, quantity = 1) => {
    const key = getBookKey(book);
    const requestedQuantity = normalizeQuantity(quantity);
    if (!key || requestedQuantity <= 0) {
      return { success: false, reason: "invalid_quantity", addedQuantity: 0 };
    }

    const existing = items.find((item) => getBookKey(item.book) === key);
    const currentQuantity = existing?.quantity || 0;
    const nextQuantity = clampQuantity(book, currentQuantity + requestedQuantity);
    const addedQuantity = Math.max(0, nextQuantity - currentQuantity);
    const stockLimit = getStockLimit(book);
    const result = {
      success: addedQuantity > 0,
      addedQuantity,
      quantity: nextQuantity,
      maxQuantity: Number.isFinite(stockLimit) ? stockLimit : null,
      capped: addedQuantity < requestedQuantity,
      reason:
        addedQuantity > 0
          ? null
          : stockLimit === 0
            ? "out_of_stock"
            : "limit_reached",
    };

    setItems((prev) => {
      const prevExisting = prev.find((item) => getBookKey(item.book) === key);
      if (prevExisting) {
        return prev.map((item) =>
          getBookKey(item.book) === key
            ? {
                ...item,
                book: { ...item.book, ...book },
                quantity: clampQuantity(book, item.quantity + requestedQuantity),
              }
            : item
        );
      }
      const clampedQuantity = clampQuantity(book, requestedQuantity);
      if (clampedQuantity <= 0) return prev;
      return [...prev, { book, quantity: clampedQuantity }];
    });

    persistServer(() => cartAPI.addItem(key, requestedQuantity));

    return result;
  };

  const removeItem = (bookId) => {
    setItems((prev) =>
      prev.filter((item) => getBookKey(item.book) !== String(bookId))
    );
    persistServer(() => cartAPI.removeItem(bookId));
  };

  const updateQuantity = (bookId, quantity) => {
    const item = items.find((cartItem) => getBookKey(cartItem.book) === String(bookId));
    const nextQuantity = item ? clampQuantity(item.book, quantity) : quantity;
    if (nextQuantity <= 0) {
      removeItem(bookId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        getBookKey(item.book) === String(bookId)
          ? { ...item, quantity: clampQuantity(item.book, quantity) }
          : item
      )
    );
    persistServer(() => cartAPI.updateItem(bookId, nextQuantity));
  };

  const clearCart = () => {
    setItems([]);
    persistServer(() => cartAPI.clear());
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.book.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
