import { request } from "./client";

export const notificationsAPI = {
  getAll: (limit = 20) => request(`/notifications?limit=${limit}`),
  markRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => request("/notifications/read-all", { method: "PATCH" }),
};
