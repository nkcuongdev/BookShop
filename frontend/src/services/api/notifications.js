import { request } from "./client";

export const notificationsAPI = {
  getAll: (params = 20) => {
    const normalized = typeof params === "number" ? { limit: params } : params;
    const query = new URLSearchParams(normalized || {}).toString();
    return request(`/notifications${query ? `?${query}` : ""}`);
  },
  markRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => request("/notifications/read-all", { method: "PATCH" }),
  getPreferences: () => request("/notifications/preferences"),
  updatePreferences: (preferences) =>
    request("/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify(preferences),
    }),
};
