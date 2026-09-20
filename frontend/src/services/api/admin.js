import { downloadFile, request } from "./client";

function buildQuery(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
  return new URLSearchParams(clean).toString();
}

export const adminAPI = {
  getOrders: async (params = {}) => {
    const query = buildQuery(params);
    return request(`/admin/orders${query ? `?${query}` : ""}`);
  },

  exportOrders: async (params = {}) => {
    const query = buildQuery(params);
    return downloadFile(`/admin/orders/export.csv${query ? `?${query}` : ""}`);
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
  cancelOrder: async (id, payload) =>
    request(`/admin/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),
  shipOrder: async (id, payload) =>
    request(`/admin/orders/${id}/ship`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),
  deliverOrder: async (id) =>
    request(`/admin/orders/${id}/deliver`, { method: "POST" }),
  createShipment: async (id) =>
    request(`/admin/orders/${id}/shipment`, { method: "POST" }),
  cancelShipment: async (id) =>
    request(`/admin/orders/${id}/shipment`, { method: "DELETE" }),
  controlShipmentSimulation: async (id, action) =>
    request(`/admin/orders/${id}/shipment/simulation`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  resolveReturnRequest: async (id, payload) =>
    request(`/admin/orders/${id}/return-request`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getStats: async () => request("/admin/stats"),

  getReviews: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/admin/reviews${query ? `?${query}` : ""}`);
  },

  moderateReview: async (id, payload) =>
    request(`/admin/reviews/${id}/moderation`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
