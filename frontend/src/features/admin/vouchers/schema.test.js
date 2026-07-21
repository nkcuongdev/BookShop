import { describe, expect, it } from "vitest";
import {
  campaignDateToInput,
  campaignDatesToApi,
  voucherDefaults,
  voucherSchema,
} from "./schema.js";

describe("voucher campaign dates", () => {
  it("round-trips inclusive Vietnam calendar days to exclusive API bounds", () => {
    const dates = campaignDatesToApi("2026-07-26", "2026-07-26");
    expect(dates).toEqual({
      startAt: "2026-07-25T17:00:00.000Z",
      endAt: "2026-07-26T17:00:00.000Z",
    });
    expect(campaignDateToInput(dates.startAt)).toBe("2026-07-26");
    expect(campaignDateToInput(dates.endAt, { endExclusive: true })).toBe(
      "2026-07-26"
    );
  });

  it("rejects invalid percent and per-user limits", () => {
    const result = voucherSchema.safeParse({
      code: "SALE",
      type: "percent",
      value: 101,
      minOrder: 0,
      maxDiscount: 0,
      startAt: "2026-07-26",
      endAt: "2026-07-26",
      usageLimit: 2,
      perUserLimit: 3,
      active: true,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("keeps new vouchers private unless an admin opts in", () => {
    const input = {
      code: "PUBLIC_SALE",
      type: "percent",
      value: 10,
      minOrder: 0,
      maxDiscount: 0,
      startAt: "2026-07-26",
      endAt: "2026-07-27",
      usageLimit: 10,
      perUserLimit: 1,
      active: true,
      description: "",
    };

    expect(voucherDefaults.publicVisible).toBe(false);
    expect(voucherDefaults.scope).toBe("order");
    expect(voucherSchema.parse(input).publicVisible).toBe(false);
    expect(voucherSchema.parse(input).scope).toBe("order");
    expect(
      voucherSchema.parse({ ...input, publicVisible: true }).publicVisible
    ).toBe(true);
  });

  it("clears max discount for fixed vouchers", () => {
    const parsed = voucherSchema.parse({
      code: "FIXED_SALE",
      type: "fixed",
      value: 50_000,
      minOrder: 0,
      maxDiscount: 25_000,
      startAt: "2026-07-26",
      endAt: "2026-07-27",
      usageLimit: 10,
      perUserLimit: 1,
      active: true,
      description: "",
    });

    expect(parsed.maxDiscount).toBe(0);
  });
});
