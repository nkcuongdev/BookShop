import { request } from "./client";

export const cartAPI = {
  get: () => request("/cart"),
  addItem: (bookId, quantity = 1) =>
    request("/cart/items", {
      method: "POST",
      body: JSON.stringify({ bookId, quantity }),
    }),
  updateItem: (bookId, quantity) =>
    request(`/cart/items/${bookId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }),
  removeItem: (bookId) => request(`/cart/items/${bookId}`, { method: "DELETE" }),
  clear: () => request("/cart", { method: "DELETE" }),
  merge: (items = []) =>
    request("/cart/merge", {
      method: "POST",
      body: JSON.stringify({
        items: items.map((item) => ({
          bookId: item.book?._id || item.book?.id || item.bookId,
          quantity: item.quantity,
        })),
      }),
    }),
};
