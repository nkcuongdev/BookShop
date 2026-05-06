import { request } from "./client";

export const categoriesAPI = {
  getAll: async () => request("/categories"),

  create: async (categoryData) =>
    request("/categories", {
      method: "POST",
      body: JSON.stringify(categoryData),
    }),

  update: async (id, categoryData) =>
    request(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(categoryData),
    }),

  delete: async (id) => request(`/categories/${id}`, { method: "DELETE" }),
};
