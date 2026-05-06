import { request } from "./client";

export const authAPI = {
  login: async (email, password) => {
    const response = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (response.success) {
      localStorage.setItem("bookshop_token", response.data.token);
      localStorage.setItem("bookshop_user", JSON.stringify(response.data.user));
    }
    return response;
  },

  register: async (name, email, password) => {
    const response = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    if (response.success) {
      localStorage.setItem("bookshop_token", response.data.token);
      localStorage.setItem("bookshop_user", JSON.stringify(response.data.user));
    }
    return response;
  },

  logout: () => {
    localStorage.removeItem("bookshop_token");
    localStorage.removeItem("bookshop_user");
  },

  getCurrentUser: () => {
    const user = localStorage.getItem("bookshop_user");
    return user ? JSON.parse(user) : null;
  },

  getMe: async () => request("/auth/me"),

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

  changePassword: async (currentPassword, newPassword) =>
    request("/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

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
