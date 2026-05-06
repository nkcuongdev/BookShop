import { request } from "./client";

function buildQuery(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    )
  );
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : "";
}

export const promotionsAPI = {
  getAll: (params = {}) => request(`/admin/promotions${buildQuery(params)}`),

  getById: (id) => request(`/admin/promotions/${id}`),

  create: (data) =>
    request(`/admin/promotions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/admin/promotions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    request(`/admin/promotions/${id}`, {
      method: "DELETE",
    }),

  toggleActive: (id) =>
    request(`/admin/promotions/${id}/toggle`, {
      method: "PATCH",
    }),

  searchBooks: (params = {}) =>
    request(`/admin/promotions/util/books${buildQuery(params)}`),
};
