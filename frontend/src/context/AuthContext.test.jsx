// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  authAPI: {
    getMe: mocks.getMe,
  },
}));

vi.mock("@/services/socket", () => ({
  disconnectSocket: vi.fn(),
}));

import { AuthProvider, useAuth } from "./AuthContext.jsx";

function AuthProbe() {
  const { user, loading } = useAuth();
  return (
    <div data-testid="auth-state" data-loading={String(loading)}>
      {user?.email || "anonymous"}
    </div>
  );
}

beforeEach(() => {
  const values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AuthProvider hydration", () => {
  it("restores a cookie session even when there is no cached local user", async () => {
    let resolveSession;
    mocks.getMe.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      })
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-state").dataset.loading).toBe("true");
    expect(mocks.getMe).toHaveBeenCalledWith({ silent: true });

    await act(async () => {
      resolveSession({
        success: true,
        data: { user: { id: "user-1", email: "reader@example.com" } },
      });
    });

    expect(screen.getByTestId("auth-state").dataset.loading).toBe("false");
    expect(screen.getByText("reader@example.com")).toBeTruthy();
  });

  it("finishes hydration as anonymous when no server session exists", async () => {
    mocks.getMe.mockRejectedValue(new Error("Authentication required"));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await act(async () => undefined);

    expect(screen.getByTestId("auth-state").dataset.loading).toBe("false");
    expect(screen.getByText("anonymous")).toBeTruthy();
  });
});
