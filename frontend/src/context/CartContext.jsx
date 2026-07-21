import { createContext, useCallback, useContext, useState, useEffect, useRef } from "react";
import { cartAPI } from "@/services/api";
import { useAuth } from "@/context/AuthContext.jsx";

const CartContext = createContext(null);
const GUEST_CART_KEY = "bookshop_guest_cart";
const LEGACY_CART_KEY = "bookshop_cart";
const MAX_ITEM_QUANTITY = 99;

const getUserId = (user) => String(user?.id || user?._id || "");
const getUserCartKey = (userId) => `bookshop_cart_user_${userId}`;

const getBookKey = (book) => book?._id || book?.id || book || null;

const getStockLimit = (book) => {
  const stock = Number(book?.stock);
  return Number.isFinite(stock)
    ? Math.min(MAX_ITEM_QUANTITY, Math.max(0, Math.floor(stock)))
    : MAX_ITEM_QUANTITY;
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
    const book =
      entry?.book ||
      (entry?.bookId
        ? { _id: entry.bookId, ...(entry.snapshot || {}) }
        : null);
    const key = getBookKey(book);
    const available = entry?.available !== false && !entry?.unavailableReason;
    const qty = available
      ? clampQuantity(book, entry?.quantity)
      : normalizeQuantity(entry?.quantity);
    if (!key || qty <= 0) continue;

    const prev = merged.get(key);
    if (prev) {
      prev.quantity = clampQuantity(prev.book, prev.quantity + qty);
      continue;
    }
    merged.set(key, {
      book,
      quantity: qty,
      available,
      unavailableReason: entry?.unavailableReason || "",
      adjustment: entry?.adjustment || null,
    });
  }
  return Array.from(merged.values()).filter((item) => item.quantity > 0);
}

function toStoredCart(items) {
  return normalizeCartItems(items).map(({
    book,
    quantity,
    available,
    unavailableReason,
    adjustment,
  }) => {
    const stock = Number(book?.stock);
    return {
      bookId: String(getBookKey(book)),
      quantity,
      available,
      unavailableReason,
      adjustment,
      snapshot: {
        title: book?.title || "",
        author: book?.author || "",
        imageUrl: book?.imageUrl || "",
        price: Number(book?.price) || 0,
        ...(Number.isFinite(stock)
          ? {
              stock: Math.min(
                MAX_ITEM_QUANTITY,
                Math.max(0, Math.floor(stock))
              ),
            }
          : {}),
        status: book?.status || "active",
      },
    };
  });
}

function writeStoredCart(key, items) {
  const serialized = JSON.stringify(toStoredCart(items));
  if (localStorage.getItem(key) !== serialized) {
    localStorage.setItem(key, serialized);
  }
}

function readStoredCart(key) {
  try {
    return normalizeCartItems(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const userId = getUserId(user);
  const identity = authLoading
    ? "pending"
    : userId
      ? `user:${userId}`
      : "guest";
  const [items, setItems] = useState(() => {
    const guestItems = readStoredCart(GUEST_CART_KEY);
    return guestItems.length ? guestItems : readStoredCart(LEGACY_CART_KEY);
  });
  const [syncError, setSyncError] = useState("");
  const [cartNotices, setCartNotices] = useState([]);
  const [hydratedIdentity, setHydratedIdentity] = useState("");
  const writeQueueRef = useRef(Promise.resolve());
  const writeVersionRef = useRef(0);
  const identityRef = useRef(identity);
  const loading = identity === "pending" || hydratedIdentity !== identity;

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    if (identity === "pending") {
      writeStoredCart(GUEST_CART_KEY, items);
      localStorage.removeItem(LEGACY_CART_KEY);
      return;
    }
    if (hydratedIdentity !== identity) return;

    const key = userId ? getUserCartKey(userId) : GUEST_CART_KEY;
    writeStoredCart(key, items);
    localStorage.removeItem(LEGACY_CART_KEY);
  }, [hydratedIdentity, identity, items, userId]);

  useEffect(() => {
    if (authLoading) return undefined;
    let active = true;
    const syncIdentity = identity;

    const syncServerCart = async () => {
      writeVersionRef.current += 1;
      if (!userId) {
        if (active && identityRef.current === syncIdentity) {
          setItems(readStoredCart(GUEST_CART_KEY));
          setSyncError("");
          setHydratedIdentity(syncIdentity);
        }
        return;
      }
      try {
        const guestItems = readStoredCart(GUEST_CART_KEY);
        const res = guestItems.length
          ? await cartAPI.merge(guestItems)
          : await cartAPI.get();
        if (!active || identityRef.current !== syncIdentity) return;
        const serverItems = normalizeCartItems(res?.data?.cart?.items || []);
        setItems(serverItems);
        setCartNotices([
          ...(res?.data?.cart?.unavailableItems || []),
          ...(res?.data?.cart?.adjustedItems || []),
        ]);
        writeStoredCart(getUserCartKey(userId), serverItems);
        if (guestItems.length) localStorage.removeItem(GUEST_CART_KEY);
        setSyncError("");
      } catch (error) {
        if (!active || identityRef.current !== syncIdentity) return;
        setItems(readStoredCart(getUserCartKey(userId)));
        setSyncError(error.message || "Không thể đồng bộ giỏ hàng");
      } finally {
        if (active && identityRef.current === syncIdentity) {
          setHydratedIdentity(syncIdentity);
        }
      }
    };

    syncServerCart();
    return () => {
      active = false;
    };
  }, [authLoading, identity, userId]);

  useEffect(() => {
    if (identity === "pending" || hydratedIdentity !== identity) return undefined;
    const key = userId ? getUserCartKey(userId) : GUEST_CART_KEY;
    const onStorage = (event) => {
      if (event.key !== key) return;
      setItems(readStoredCart(key));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydratedIdentity, identity, userId]);

  const persistServer = (operation) => {
    if (!userId || loading) return;
    const operationIdentity = identity;
    const version = ++writeVersionRef.current;

    writeQueueRef.current = writeQueueRef.current
      .catch(() => null)
      .then(async () => {
        if (identityRef.current !== operationIdentity) return;
        try {
          const response = await operation();
          if (
            version !== writeVersionRef.current ||
            identityRef.current !== operationIdentity
          ) {
            return;
          }
          const serverItems = normalizeCartItems(
            response?.data?.cart?.items || []
          );
          setItems(serverItems);
          setCartNotices([
            ...(response?.data?.cart?.unavailableItems || []),
            ...(response?.data?.cart?.adjustedItems || []),
          ]);
          setSyncError("");
        } catch (error) {
          if (
            version !== writeVersionRef.current ||
            identityRef.current !== operationIdentity
          ) {
            return;
          }
          setSyncError(error.message || "Không thể đồng bộ giỏ hàng");
          try {
            const response = await cartAPI.get();
            if (
              version === writeVersionRef.current &&
              identityRef.current === operationIdentity
            ) {
              setItems(normalizeCartItems(response?.data?.cart?.items || []));
              setCartNotices([
                ...(response?.data?.cart?.unavailableItems || []),
                ...(response?.data?.cart?.adjustedItems || []),
              ]);
            }
          } catch {
            // Keep the optimistic local state until connectivity returns.
          }
        }
      });
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

  const refreshCart = useCallback(async () => {
    if (!userId) return [];
    const operationIdentity = identityRef.current;
    const response = await cartAPI.get();
    if (identityRef.current !== operationIdentity) return [];
    const serverItems = normalizeCartItems(response?.data?.cart?.items || []);
    setItems(serverItems);
    setCartNotices([
      ...(response?.data?.cart?.unavailableItems || []),
      ...(response?.data?.cart?.adjustedItems || []),
    ]);
    writeStoredCart(getUserCartKey(userId), serverItems);
    setSyncError("");
    return serverItems;
  }, [userId]);

  // The server removes these exact quantities in the order transaction. This
  // local-only mirror avoids deleting products added in another tab afterward.
  const removePurchasedItems = (purchasedItems = []) => {
    const purchased = new Map(
      purchasedItems.map((item) => [
        String(item.book?._id || item.book || item.bookId || ""),
        normalizeQuantity(item.quantity),
      ])
    );
    setItems((prev) =>
      prev.flatMap((item) => {
        const key = String(getBookKey(item.book) || "");
        const remaining = item.quantity - (purchased.get(key) || 0);
        return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
      })
    );
  };

  const checkoutItems = items.filter((item) => item.available !== false);
  const totalItems = checkoutItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = checkoutItems.reduce(
    (sum, item) => sum + item.book.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        checkoutItems,
        cartNotices,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        removePurchasedItems,
        refreshCart,
        totalItems,
        totalPrice,
        loading,
        syncError,
        clearSyncError: () => setSyncError(""),
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
