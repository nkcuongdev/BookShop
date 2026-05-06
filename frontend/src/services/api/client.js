export const API_BASE = "http://localhost:5000/api";

const getToken = () => localStorage.getItem("bookshop_token");

export async function request(endpoint, options = {}) {
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
}

export function delay(ms = 400) {
  return new Promise((r) => setTimeout(r, ms));
}
