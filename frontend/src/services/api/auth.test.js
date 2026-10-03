// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authAPI } from "./auth";
import { API_BASE } from "./client";

const user = { id: "reader-1", email: "reader@example.com" };

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const actions = [
  ["login", () => authAPI.login(user.email, "secure-password")],
  ["register", () => authAPI.register("Reader", user.email, "secure-password")],
];

describe("session confirmation", () => {
  it.each(actions)("%s waits for the cookie round trip before caching a user", async (_action, submit) => {
    let resolveSession;
    fetch
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { user, csrfToken: "csrf-token" },
      }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSession = resolve; }));

    const pending = submit();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem("bookshop_user")).toBeNull();
    expect(fetch).toHaveBeenLastCalledWith(`${API_BASE}/auth/me`,
      expect.objectContaining({ credentials: "include" }));

    resolveSession(jsonResponse({ success: true, data: { user } }));
    await expect(pending).resolves.toMatchObject({ success: true });
    expect(JSON.parse(localStorage.getItem("bookshop_user"))).toEqual(user);
    expect(localStorage.getItem("bookshop_csrf")).toBe("csrf-token");
  });

  it.each(actions)("%s reports rejected session cookies without refreshing or redirecting", async (_action, submit) => {
    fetch
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { user, csrfToken: "csrf-token" },
      }))
      .mockResolvedValueOnce(jsonResponse({ message: "Authentication required" }, 401));

    await expect(submit()).rejects.toMatchObject({
      status: 401,
      code: "SESSION_COOKIE_BLOCKED",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("bookshop_user")).toBeNull();
    expect(localStorage.getItem("bookshop_csrf")).toBeNull();
  });

  it("preserves wrong-password errors without attempting session confirmation", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      message: "Email hoặc mật khẩu không đúng",
    }, 401));

    await expect(authAPI.login(user.email, "wrong-password")).rejects.toMatchObject({
      status: 401,
      message: "Email hoặc mật khẩu không đúng",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
