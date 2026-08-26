import { request } from "./client";

export const chatAPI = {
  // Admin
  getConversations: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
    ).toString();
    return request(`/admin/chat/conversations${query ? `?${query}` : ""}`);
  },

  getMessages: (conversationId, params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
    ).toString();
    return request(
      `/admin/chat/conversations/${conversationId}/messages${query ? `?${query}` : ""}`
    );
  },

  sendMessage: (conversationId, text) =>
    request(`/admin/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  markRead: (conversationId) =>
    request(`/admin/chat/conversations/${conversationId}/read`, {
      method: "PATCH",
    }),

  // Customer
  getMyChat: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/chat/me${query ? `?${query}` : ""}`);
  },

  sendMyMessage: (text) =>
    request(`/chat/me/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
