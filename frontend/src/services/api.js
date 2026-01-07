const API_BASE = "http://localhost:5000/api";

// Get stored token
const getToken = () => localStorage.getItem("bookshop_token");

// API request helper
const request = async (endpoint, options = {}) => {
  const token = getToken();

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// ============ AUTH API ============
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

  getMe: async () => {
    return request("/auth/me");
  },
};

// ============ BOOKS API ============
export const booksAPI = {
  getAll: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/books${query ? `?${query}` : ""}`);
  },

  getBestSellers: async (limit = 8) => {
    return request(`/books/best-sellers?limit=${limit}`);
  },

  getNewArrivals: async (limit = 8) => {
    return request(`/books/new-arrivals?limit=${limit}`);
  },

  getById: async (id) => {
    return request(`/books/${id}`);
  },

  getReviews: async (bookId) => {
    return request(`/books/${bookId}/reviews`);
  },

  canReview: async (bookId) => {
    return request(`/books/${bookId}/can-review`);
  },

  createReview: async (bookId, rating, comment) => {
    return request(`/books/${bookId}/reviews`, {
      method: "POST",
      body: JSON.stringify({ rating, comment }),
    });
  },

  // Admin
  create: async (bookData) => {
    return request("/books", {
      method: "POST",
      body: JSON.stringify(bookData),
    });
  },

  update: async (id, bookData) => {
    return request(`/books/${id}`, {
      method: "PUT",
      body: JSON.stringify(bookData),
    });
  },

  delete: async (id) => {
    return request(`/books/${id}`, {
      method: "DELETE",
    });
  },
};

// ============ ORDERS API ============
export const ordersAPI = {
  create: async (items, shippingAddress) => {
    return request("/orders", {
      method: "POST",
      body: JSON.stringify({ items, shippingAddress }),
    });
  },

  getMyOrders: async () => {
    return request("/orders");
  },

  getById: async (id) => {
    return request(`/orders/${id}`);
  },
};

// ============ ADMIN API ============
export const adminAPI = {
  getOrders: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/admin/orders${query ? `?${query}` : ""}`);
  },

  getOrderById: async (id) => {
    return request(`/admin/orders/${id}`);
  },

  updateOrderStatus: async (id, status) => {
    return request(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  getStats: async () => {
    return request("/admin/stats");
  },
};

// ============ CATEGORIES API ============
export const categoriesAPI = {
  getAll: async () => {
    return request("/categories");
  },

  create: async (categoryData) => {
    return request("/categories", {
      method: "POST",
      body: JSON.stringify(categoryData),
    });
  },

  update: async (id, categoryData) => {
    return request(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(categoryData),
    });
  },

  delete: async (id) => {
    return request(`/categories/${id}`, {
      method: "DELETE",
    });
  },
};

export default {
  auth: authAPI,
  books: booksAPI,
  orders: ordersAPI,
  admin: adminAPI,
  categories: categoriesAPI,
};
