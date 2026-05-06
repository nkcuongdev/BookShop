import { useEffect, useState, useCallback } from "react";
import { authAPI } from "@/services/api";

export default function useWishlist() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const user = authAPI.getCurrentUser();
      if (!user) {
        if (active) setItems([]);
        return;
      }

      try {
        const res = await authAPI.getWishlist();
        if (active && res.success) {
          setItems(res?.data?.items || []);
        }
      } catch {
        if (active) setItems([]);
      }
    };

    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const isWishlisted = useCallback(
    (bookId) => items.some((b) => (b._id || b.id) === bookId),
    [items]
  );

  const toggle = useCallback(async (book) => {
    if (!book) return;
    const id = book._id || book.id;
    const user = authAPI.getCurrentUser();
    if (!user) return { success: false, requiresAuth: true };

    const existing = items.some((b) => (b._id || b.id) === id);
    setItems((prev) =>
      existing
        ? prev.filter((b) => (b._id || b.id) !== id)
        : [...prev, book]
    );

    try {
      const res = await authAPI.toggleWishlist(id);
      if (!res.success) {
        setItems((prev) =>
          existing
            ? [...prev, book]
            : prev.filter((b) => (b._id || b.id) !== id)
        );
        return { success: false, message: res.message };
      }
      return { success: true, wished: !!res?.data?.wished };
    } catch {
      setItems((prev) =>
        existing
          ? [...prev, book]
          : prev.filter((b) => (b._id || b.id) !== id)
      );
      return { success: false, message: "Không thể cập nhật yêu thích" };
    }
  }, [items]);

  const remove = useCallback(async (bookId) => {
    const book = items.find((b) => (b._id || b.id) === bookId);
    if (!book) return;
    await toggle(book);
  }, [items, toggle]);

  const clear = useCallback(async () => {
    const user = authAPI.getCurrentUser();
    if (!user) return;
    const res = await authAPI.clearWishlist();
    if (res.success) setItems([]);
  }, []);

  return { items, isWishlisted, toggle, remove, clear };
}
