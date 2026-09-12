import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./navigation";

describe("safeInternalRedirect", () => {
  it("preserves a canonical internal path, query and hash", () => {
    expect(safeInternalRedirect("/checkout?step=2#shipping")).toBe(
      "/checkout?step=2#shipping"
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example/path",
    "/%5cevil.example/path",
    "/%2f%2fevil.example/path",
    "/checkout%0d%0aLocation:https://evil.example",
    "%2Fcheckout",
    "javascript:alert(1)",
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeInternalRedirect(value)).toBe("/");
  });
});
