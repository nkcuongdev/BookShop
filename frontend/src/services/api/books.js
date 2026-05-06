import { request } from "./client";

export const booksAPI = {
  getAll: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/books${query ? `?${query}` : ""}`);
  },

  getBestSellers: async (limit = 8) =>
    request(`/books/best-sellers?limit=${limit}`),

  getNewArrivals: async (limit = 8) =>
    request(`/books/new-arrivals?limit=${limit}`),

  getById: async (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/books/${id}${query ? `?${query}` : ""}`);
  },

  getReviews: async (bookId) => request(`/books/${bookId}/reviews`),

  canReview: async (bookId) => request(`/books/${bookId}/can-review`),

  createReview: async (bookId, rating, comment) =>
    request(`/books/${bookId}/reviews`, {
      method: "POST",
      body: JSON.stringify({ rating, comment }),
    }),

  create: async (bookData) =>
    request("/books", { method: "POST", body: JSON.stringify(bookData) }),

  update: async (id, bookData) =>
    request(`/books/${id}`, { method: "PUT", body: JSON.stringify(bookData) }),

  delete: async (id) => request(`/books/${id}`, { method: "DELETE" }),
};
