import { request } from "./client";

export const chatAPI = {
  // Admin
  getConversations: () => request(`/admin/chat/conversations`),

  getMessages: (conversationId) =>
    request(`/admin/chat/conversations/${conversationId}/messages`),

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
  getMyChat: () => request(`/chat/me`),

  sendMyMessage: (text) =>
    request(`/chat/me/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
