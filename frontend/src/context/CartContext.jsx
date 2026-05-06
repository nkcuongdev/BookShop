import { createContext, useContext, useState, useEffect } from "react";

const CartContext = createContext(null);

const getBookKey = (book) => book?._id || book?.id || null;

function normalizeCartItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  const merged = new Map();
  for (const entry of rawItems) {
    const key = getBookKey(entry?.book);
    const qty = Number(entry?.quantity) || 0;
    if (!key || qty <= 0) continue;

    const prev = merged.get(key);
    if (prev) {
      prev.quantity += qty;
      continue;
    }
    merged.set(key, { book: entry.book, quantity: qty });
  }
  return Array.from(merged.values());
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

  const addItem = (book, quantity = 1) => {
    const key = getBookKey(book);
    if (!key) return;

    setItems((prev) => {
      const existing = prev.find((item) => getBookKey(item.book) === key);
      if (existing) {
        return prev.map((item) =>
          getBookKey(item.book) === key
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { book, quantity }];
    });
  };

  const removeItem = (bookId) => {
    setItems((prev) =>
      prev.filter((item) => getBookKey(item.book) !== String(bookId))
    );
  };

  const updateQuantity = (bookId, quantity) => {
    if (quantity <= 0) {
      removeItem(bookId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        getBookKey(item.book) === String(bookId) ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
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
