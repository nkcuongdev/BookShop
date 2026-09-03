import { request } from "./client";

export const newsletterAPI = {
  subscribe: (email) =>
    request("/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  confirm: (token) =>
    request("/newsletter/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  unsubscribe: (token) =>
    request("/newsletter/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  getAdminOverview: () => request("/admin/newsletter"),
  sendContent: (payload) =>
    request("/admin/newsletter/send", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
