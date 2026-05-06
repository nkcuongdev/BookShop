import { request } from "./client";

export const ordersAPI = {
  create: async (payload) =>
    request("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMyOrders: async () => request("/orders"),

  getById: async (id) => request(`/orders/${id}`),

  cancel: async (id, reason = "") =>
    request(`/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  retryPayment: async (id) =>
    request(`/orders/${id}/retry-payment`, { method: "POST" }),
};
