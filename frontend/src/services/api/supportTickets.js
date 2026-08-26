import { request } from "./client";

function withQuery(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ).toString();
  return `${path}${query ? `?${query}` : ""}`;
}

export const supportTicketsAPI = {
  getMine: () => request("/support-tickets"),
  getMineById: (id) => request(`/support-tickets/${id}`),
  getMineMessages: (id, params = {}) =>
    request(withQuery(`/support-tickets/${id}/messages`, params)),
  create: (payload) =>
    request("/support-tickets", { method: "POST", body: JSON.stringify(payload) }),
  sendMessage: (id, text) =>
    request(`/support-tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  getAdminTickets: (params) => request(withQuery("/admin/support-tickets", params)),
  getAdminTicket: (id) => request(`/admin/support-tickets/${id}`),
  getAdminMessages: (id, params = {}) =>
    request(withQuery(`/admin/support-tickets/${id}/messages`, params)),
  getAgents: () => request("/admin/support-tickets/agents"),
  getShippingProviders: () =>
    request("/admin/support-tickets/shipping-providers"),
  update: (id, payload) =>
    request(`/admin/support-tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  sendAdminMessage: (id, text) =>
    request(`/admin/support-tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  createResolution: (id, payload) =>
    request(`/admin/support-tickets/${id}/resolution`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  completeManualRefund: (id, transactionId) =>
    request(`/admin/support-tickets/${id}/resolution/refund`, {
      method: "PATCH",
      body: JSON.stringify({ transactionId }),
    }),
  updateReship: (id, payload) =>
    request(`/admin/support-tickets/${id}/resolution/reship`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
