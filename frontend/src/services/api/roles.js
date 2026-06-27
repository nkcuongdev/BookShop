import { request } from "./client";

export const rolesAPI = {
  getAll: () => request("/admin/roles"),

  /** The permission vocabulary, grouped for the role editor. */
  getPermissionCatalog: () => request("/admin/roles/permissions"),

  /** What the signed-in user may do. Any authenticated account may call this. */
  getMine: () => request("/admin/roles/me"),

  create: (data) =>
    request("/admin/roles", { method: "POST", body: JSON.stringify(data) }),

  update: (key, data) =>
    request(`/admin/roles/${key}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: (key) => request(`/admin/roles/${key}`, { method: "DELETE" }),
};
