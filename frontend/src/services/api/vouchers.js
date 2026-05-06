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

export const vouchersAPI = {
  getAll: (params = {}) => request(`/admin/vouchers${buildQuery(params)}`),

  create: (data) =>
    request(`/admin/vouchers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/admin/vouchers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    request(`/admin/vouchers/${id}`, {
      method: "DELETE",
    }),

  toggleActive: (id) =>
    request(`/admin/vouchers/${id}/toggle`, {
      method: "PATCH",
    }),
};
