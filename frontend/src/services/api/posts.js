import { request } from "./client";

function buildQuery(params = {}) {
  const cleanParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    cleanParams[key] = value;
  }
  return new URLSearchParams(cleanParams).toString();
}

export const postsAPI = {
  // Public APIs
  getPublished: async (params = {}) => {
    const query = buildQuery(params);
    return request(`/posts${query ? `?${query}` : ""}`);
  },

  getLatest: async (limit = 5) => request(`/posts/latest?limit=${limit}`),

  getBySlug: async (slug) => request(`/posts/${slug}`),

  getCategories: async () => request("/posts/categories"),

  // Admin APIs
  getAll: async (params = {}) => {
    const query = buildQuery(params);
    return request(`/posts/admin/all${query ? `?${query}` : ""}`);
  },

  getById: async (id) => request(`/posts/admin/${id}`),

  create: async (data) =>
    request("/posts/admin", { method: "POST", body: JSON.stringify(data) }),

  update: async (id, data) =>
    request(`/posts/admin/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: async (id) => request(`/posts/admin/${id}`, { method: "DELETE" }),

  publish: async (id) =>
    request(`/posts/admin/${id}/publish`, { method: "PATCH" }),

  unpublish: async (id) =>
    request(`/posts/admin/${id}/unpublish`, { method: "PATCH" }),

  // Admin Category APIs
  getAllCategories: async () => request("/posts/admin/categories/all"),

  createCategory: async (data) =>
    request("/posts/admin/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCategory: async (id, data) =>
    request(`/posts/admin/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteCategory: async (id) =>
    request(`/posts/admin/categories/${id}`, { method: "DELETE" }),
};
