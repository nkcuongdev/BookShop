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

export const suppliersAPI = {
  getAll: (params = {}) => request(`/admin/suppliers${buildQuery(params)}`),

  getById: (id) => request(`/admin/suppliers/${id}`),

  getBooks: (id, params = {}) =>
    request(`/admin/suppliers/${id}/books${buildQuery(params)}`),

  create: (data) =>
    request(`/admin/suppliers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/admin/suppliers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  toggleStatus: (id) =>
    request(`/admin/suppliers/${id}/toggle`, {
      method: "PATCH",
    }),

  delete: (id) =>
    request(`/admin/suppliers/${id}`, {
      method: "DELETE",
    }),
};
