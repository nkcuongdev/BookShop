import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "bookshop_recently_viewed";
const MAX_ITEMS = 12;

const readStore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export default function useRecentlyViewed() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(readStore());
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setItems(readStore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((book) => {
    if (!book) return;
    const id = book._id || book.id;
    if (!id) return;
    setItems((prev) => {
      const filtered = prev.filter((b) => (b._id || b.id) !== id);
      const next = [
        {
          _id: book._id,
          id: book.id,
          title: book.title,
          author: book.author,
          price: book.price,
          imageUrl: book.imageUrl,
          rating: book.rating,
          reviewCount: book.reviewCount,
          category: book.category,
          stock: book.stock,
          sold: book.sold,
        },
        ...filtered,
      ].slice(0, MAX_ITEMS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  }, []);

  return { items, add, clear };
}
