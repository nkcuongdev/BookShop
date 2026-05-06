import { request } from "./client";

export const adminAPI = {
  getOrders: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/admin/orders${query ? `?${query}` : ""}`);
  },

  getOrderById: async (id) => request(`/admin/orders/${id}`),

  // Back-compat: PATCH /admin/orders/:id/status (PROCESSING/SHIPPED/DELIVERED)
  updateOrderStatus: async (id, status) =>
    request(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // Dedicated action endpoints
  confirmOrder: async (id) =>
    request(`/admin/orders/${id}/confirm`, { method: "POST" }),
  shipOrder: async (id) =>
    request(`/admin/orders/${id}/ship`, { method: "POST" }),
  deliverOrder: async (id) =>
    request(`/admin/orders/${id}/deliver`, { method: "POST" }),

  getStats: async () => request("/admin/stats"),
};
