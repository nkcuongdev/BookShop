import { request } from "./client";

export const ordersAPI = {
  getShippingQuotes: async (payload) =>
    request("/shipping/quotes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  create: async (payload, idempotencyKey) =>
    request("/orders", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),

  getMyOrders: async (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
    ).toString();
    return request(`/orders${query ? `?${query}` : ""}`);
  },

  getById: async (id) => request(`/orders/${id}`),

  getByCode: async (orderCode) =>
    request(`/orders/code/${encodeURIComponent(orderCode)}`),

  createReturnRequest: async (id, payload) =>
    request(`/orders/${id}/return-request`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cancel: async (id, reason = "") =>
    request(`/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  retryPayment: async (id) =>
    request(`/orders/${id}/retry-payment`, { method: "POST" }),
};
