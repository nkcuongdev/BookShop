import { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "@/services/api";
import { disconnectSocket } from "@/services/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const handleSessionExpired = () => setUser(null);
    window.addEventListener("bookshop:session-expired", handleSessionExpired);

    const restoreSession = async () => {
      try {
        const response = await authAPI.getMe({ silent: true });
        if (active) setUser(response.data.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    restoreSession();

    return () => {
      active = false;
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
        return { success: true, data: response.data };
      }
      return { success: false, error: response.message };
    } catch (error) {
      return { success: false, error: error.message || "Registration failed" };
    }
  };

  const logout = async () => {
    disconnectSocket();
    await authAPI.logout().catch(() => null);
    setUser(null);
    window.dispatchEvent(new Event("bookshop:auth-changed"));
  };

  const updateProfile = async (payload) => {
    try {
      const response = await authAPI.updateMe(payload);
      if (response.success) {
        setUser(response.data.user);
        return {
          success: true,
          message: response.message,
          ...response.data,
        };
      }
      return { success: false, error: response.message };
    } catch (error) {
      return { success: false, error: error.message || "Update profile failed" };
    }
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getMe({ silent: true });
      if (response.success) {
        setUser(response.data.user);
        return response.data.user;
      }
    } catch {
      // Verification can also be completed from a signed-out browser.
    }
    return null;
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateProfile, refreshUser }}
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
