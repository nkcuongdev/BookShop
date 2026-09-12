import { describe, expect, it } from "vitest";
import { formatCompact, formatOrderCode, getPriceInfo } from "./format";

describe("format utilities", () => {
  it("derives the original price from a discount percentage", () => {
    expect(getPriceInfo({ price: 80000, discountPercent: 20 })).toEqual({
      price: 80000,
      originalPrice: 100000,
      discountPercent: 20,
    });
  });

  it("uses a stable order-code fallback", () => {
    expect(formatOrderCode({ _id: "507f1f77bcf86cd799439011" })).toBe(
      "OD-99439011"
    );
    expect(formatOrderCode()).toBe("OD-UNKNOWN");
  });

  it("formats compact counts without unnecessary decimals", () => {
    expect(formatCompact(1000)).toBe("1k");
    expect(formatCompact(1250000)).toBe("1.3M");
  });
});
