import { request } from "./client";

function toQueryString(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  ).toString();
}

export const booksAPI = {
  getAll: async (params = {}) => {
    const query = toQueryString(params);
    return request(`/books${query ? `?${query}` : ""}`);
  },

  getBestSellers: async (limit = 8) =>
    request(`/books/best-sellers?limit=${limit}`),

  getNewArrivals: async (limit = 8) =>
    request(`/books/new-arrivals?limit=${limit}`),

  getHome: async () => request("/books/home"),

  getFacets: async () => request("/books/facets"),

  getRecommendations: async ({ sessionId = "", limit = 10 } = {}) => {
    const query = toQueryString({ sessionId, limit });
    return request(`/books/recommendations${query ? `?${query}` : ""}`);
  },

  getById: async (id, params = {}) => {
    const query = toQueryString(params);
    return request(`/books/${id}${query ? `?${query}` : ""}`);
  },

  getReviews: async (bookId, params = {}) => {
    const query = toQueryString(params);
    return request(`/books/${bookId}/reviews${query ? `?${query}` : ""}`);
  },

  canReview: async (bookId) => request(`/books/${bookId}/can-review`),

  createReview: async (bookId, rating, comment, images = []) =>
    request(`/books/${bookId}/reviews`, {
      method: "POST",
      body: JSON.stringify({ rating, comment, images }),
    }),

  updateReview: async (bookId, reviewId, rating, comment, images = []) =>
    request(`/books/${bookId}/reviews/${reviewId}`, {
      method: "PATCH",
      body: JSON.stringify({ rating, comment, images }),
    }),

  deleteReview: async (bookId, reviewId) =>
    request(`/books/${bookId}/reviews/${reviewId}`, { method: "DELETE" }),

  reportReview: async (bookId, reviewId, payload) =>
    request(`/books/${bookId}/reviews/${reviewId}/report`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  create: async (bookData) =>
    request("/books", { method: "POST", body: JSON.stringify(bookData) }),

  update: async (id, bookData) =>
    request(`/books/${id}`, { method: "PUT", body: JSON.stringify(bookData) }),

  delete: async (id) => request(`/books/${id}`, { method: "DELETE" }),
};
