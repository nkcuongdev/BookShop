const apiHost = import.meta.env.VITE_API_HOST;

export const API_BASE = apiHost
  ? `https://${String(apiHost).replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`
  : import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const getToken = () => localStorage.getItem("bookshop_token");

function clearStoredSession() {
  localStorage.removeItem("bookshop_token");
  localStorage.removeItem("bookshop_user");
  window.dispatchEvent(new Event("bookshop:session-expired"));
}

function redirectToLogin() {
  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login") return;
  window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
}

export async function request(endpoint, options = {}) {
  const token = getToken();
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    credentials: "include",
    ...options,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();
    if (!response.ok) {
      const isLoginRequest =
        endpoint === "/auth/login" || endpoint === "/auth/register";
      if (response.status === 401 && !isLoginRequest) {
        clearStoredSession();
        redirectToLogin();
      }
      throw new Error(data.message || "Request failed");
    }
    return data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

export function delay(ms = 400) {
  return new Promise((r) => setTimeout(r, ms));
}
