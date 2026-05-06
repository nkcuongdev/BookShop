import { request } from "./client";

function buildQuery(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && v !== "all"
    )
  );
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : "";
}

export const usersAPI = {
  getAll: (params = {}) => request(`/admin/users${buildQuery(params)}`),

  updateRole: (id, role) =>
    request(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  setStatus: (id, status) =>
    request(`/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  delete: (id) =>
    request(`/admin/users/${id}`, {
      method: "DELETE",
    }),
};
