import { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "@/services/api";
import { disconnectSocket } from "@/services/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleSessionExpired = () => setUser(null);
    window.addEventListener("bookshop:session-expired", handleSessionExpired);

    const storedUser = authAPI.getCurrentUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setLoading(false);

    return () => {
      window.removeEventListener("bookshop:session-expired", handleSessionExpired);
    };
  }, []);

  const login = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      if (response.success) {
        setUser(response.data.user);
        window.dispatchEvent(new Event("bookshop:auth-changed"));
        return { success: true };
      }
      return { success: false, error: response.message };
    } catch (error) {
      return { success: false, error: error.message || "Login failed" };
    }
  };

  const register = async (name, email, password) => {
    try {
      const response = await authAPI.register(name, email, password);
      if (response.success) {
        setUser(response.data.user);
        window.dispatchEvent(new Event("bookshop:auth-changed"));
        return { success: true };
      }
      return { success: false, error: response.message };
    } catch (error) {
      return { success: false, error: error.message || "Registration failed" };
    }
  };

  const logout = () => {
    disconnectSocket();
    authAPI.logout();
    setUser(null);
    window.dispatchEvent(new Event("bookshop:auth-changed"));
  };

  const updateProfile = async (payload) => {
    try {
      const response = await authAPI.updateMe(payload);
      if (response.success) {
        setUser(response.data.user);
        return { success: true, user: response.data.user };
      }
      return { success: false, error: response.message };
    } catch (error) {
      return { success: false, error: error.message || "Update profile failed" };
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
