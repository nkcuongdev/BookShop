// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanupLegacyTheme } from "@/lib/themeCleanup";

const LEGACY_KEY = "bookshop_admin_theme";

// jsdom's localStorage is shadowed in this environment by a Node stub that has no
// methods at all, so it is stubbed here — the same pattern AuthContext.test.jsx
// and CartContext.test.jsx already use.
beforeEach(() => {
  const values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  });
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

describe("cleanupLegacyTheme", () => {
  it("strips a stale `dark` class left by the removed theme toggle", () => {
    document.documentElement.classList.add("dark");
    cleanupLegacyTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("clears the persisted theme key", () => {
    localStorage.setItem(LEGACY_KEY, "dark");
    cleanupLegacyTheme();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("leaves other classes and other storage keys alone", () => {
    document.documentElement.classList.add("dark", "js-enabled");
    localStorage.setItem("bookshop_cart", "[]");
    cleanupLegacyTheme();
    expect(document.documentElement.classList.contains("js-enabled")).toBe(true);
    expect(localStorage.getItem("bookshop_cart")).toBe("[]");
  });

  it("is idempotent and safe when there is nothing to clean", () => {
    expect(() => {
      cleanupLegacyTheme();
      cleanupLegacyTheme();
    }).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // The class removal must not be blocked by storage being unavailable — that is
  // the half that actually affects what the user sees on first paint.
  it("still removes the class when storage access throws", () => {
    vi.stubGlobal("localStorage", {
      removeItem: () => {
        throw new Error("SecurityError: storage disabled");
      },
    });
    document.documentElement.classList.add("dark");
    expect(() => cleanupLegacyTheme()).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
