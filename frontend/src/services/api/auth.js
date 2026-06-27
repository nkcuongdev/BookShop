import { request } from "./client";

export const authAPI = {
  login: async (email, password) => {
    const response = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (response.success) {
      localStorage.setItem("bookshop_user", JSON.stringify(response.data.user));
      localStorage.setItem("bookshop_csrf", response.data.csrfToken);
      localStorage.removeItem("bookshop_token");
    }
    return response;
  },

  register: async (name, email, password) => {
    const response = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    if (response.success) {
      localStorage.setItem("bookshop_user", JSON.stringify(response.data.user));
      localStorage.setItem("bookshop_csrf", response.data.csrfToken);
      localStorage.removeItem("bookshop_token");
    }
    return response;
  },

  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST" });
    } finally {
      localStorage.removeItem("bookshop_token");
      localStorage.removeItem("bookshop_csrf");
      localStorage.removeItem("bookshop_user");
    }
  },

  getCurrentUser: () => {
    const user = localStorage.getItem("bookshop_user");
    if (!user) return null;
    try {
      return JSON.parse(user);
    } catch {
      localStorage.removeItem("bookshop_user");
      return null;
    }
  },

  getMe: async ({ silent = false } = {}) => {
    const response = await request("/auth/me", {}, {
      redirectOnUnauthorized: !silent,
      logErrors: !silent,
    });
    if (response.success && response.data?.user) {
      localStorage.setItem("bookshop_user", JSON.stringify(response.data.user));
    }
    return response;
  },

  forgotPassword: async (email) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: async (token, password) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  requestEmailVerification: async () =>
    request("/auth/email-verification/request", { method: "POST" }),

  verifyEmail: async (token) => {
    const response = await request("/auth/email-verification/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    if (response.data?.reauthRequired) {
      localStorage.removeItem("bookshop_token");
      localStorage.removeItem("bookshop_csrf");
      localStorage.removeItem("bookshop_user");
      window.dispatchEvent(new Event("bookshop:session-expired"));
    }
    return response;
  },

  updateMe: async (payload) => {
    const response = await request("/auth/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    if (response.success && response.data?.user) {
      localStorage.setItem("bookshop_user", JSON.stringify(response.data.user));
    }

    return response;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await request("/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (response.data?.reauthRequired) {
      localStorage.removeItem("bookshop_token");
      localStorage.removeItem("bookshop_csrf");
      localStorage.removeItem("bookshop_user");
      window.dispatchEvent(new Event("bookshop:session-expired"));
    }
    return response;
  },

  getAddresses: async () => request("/auth/me/addresses"),
  addAddress: async (payload) =>
    request("/auth/me/addresses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAddress: async (addressId, payload) =>
    request(`/auth/me/addresses/${addressId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteAddress: async (addressId) =>
    request(`/auth/me/addresses/${addressId}`, { method: "DELETE" }),
  setDefaultAddress: async (addressId) =>
    request(`/auth/me/addresses/${addressId}/default`, { method: "PATCH" }),

  getWishlist: async () => request("/auth/me/wishlist"),
  toggleWishlist: async (bookId) =>
    request(`/auth/me/wishlist/${bookId}`, { method: "POST" }),
  clearWishlist: async () => request("/auth/me/wishlist", { method: "DELETE" }),
};
