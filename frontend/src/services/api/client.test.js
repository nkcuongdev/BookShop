// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiError, downloadFile, refreshSession, request } from "./client.js";

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 401,
    json: vi.fn().mockResolvedValue(body),
  };
}

beforeEach(() => {
  const values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("refreshSession", () => {
  it("bootstraps CSRF from the API when browser storage has no token", async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { csrfToken: "bootstrap-csrf" } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            csrfToken: "rotated-csrf",
            user: { id: "user-1", email: "reader@example.com" },
          },
        })
      );

    await refreshSession();

    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/auth/csrf`, {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/auth/refresh`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "X-CSRF-Token": "bootstrap-csrf",
        }),
      })
    );
    expect(localStorage.getItem("bookshop_csrf")).toBe("rotated-csrf");
    expect(JSON.parse(localStorage.getItem("bookshop_user"))).toEqual({
      id: "user-1",
      email: "reader@example.com",
    });
  });
});

describe("request headers", () => {
  it("keeps bodyless GET requests CORS-simple", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    await request("/books");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/books`,
      expect.objectContaining({ headers: {} })
    );
  });

  it("sets JSON content type only for JSON bodies", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    await request("/events", {
      method: "POST",
      body: JSON.stringify({ type: "view" }),
    });
    const form = new FormData();
    form.append("image", new Blob(["image"]), "book.png");
    await request("/admin/uploads", { method: "POST", body: form });

    expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBe(
      "application/json"
    );
    expect(fetch.mock.calls[1][1].headers["Content-Type"]).toBeUndefined();
  });

  it("preserves API error status, code, field and request ID", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: { get: vi.fn().mockReturnValue("header-request-id") },
      json: vi.fn().mockResolvedValue({
        message: "Shipping quote changed",
        code: "SHIPPING_QUOTE_CHANGED",
        field: "shippingFee",
        requestId: "body-request-id",
        details: { expected: 25_000 },
      }),
    });

    const error = await request("/orders", { method: "POST", body: "{}" }).catch(
      (caught) => caught
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "SHIPPING_QUOTE_CHANGED",
      field: "shippingFee",
      requestId: "body-request-id",
      details: { expected: 25_000 },
    });
  });
});

describe("downloadFile", () => {
  it("returns the response blob and filename from content disposition", async () => {
    const blob = new Blob(["csv-data"], { type: "text/csv" });
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(
          'attachment; filename="bookshop-orders-2026-08-11.csv"'
        ),
      },
      blob: vi.fn().mockResolvedValue(blob),
    });

    const result = await downloadFile("/admin/orders/export.csv?status=PAID");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/admin/orders/export.csv?status=PAID`,
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
    expect(result).toEqual({
      blob,
      filename: "bookshop-orders-2026-08-11.csv",
    });
  });
});
