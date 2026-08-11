import { describe, it, expect } from "vitest";
import {
  POINT_VALUE_VND,
  computeMaxRedeemablePoints,
  pointsToVnd,
  vndToPoints,
  tierLabel,
  voucherValueLabel,
  pointEntryLabel,
} from "./loyalty";

const CONFIG = {
  maxPercent: 30,
  rate: POINT_VALUE_VND,
  step: 10,
  minPoints: 10,
};

describe("computeMaxRedeemablePoints", () => {
  it("is limited by the percentage cap", () => {
    // 30% of 300.000 = 90.000đ = 90 points
    expect(
      computeMaxRedeemablePoints({ ...CONFIG, balance: 500, eligibleAmount: 300_000 })
    ).toBe(90);
  });

  it("is limited by the balance", () => {
    expect(
      computeMaxRedeemablePoints({ ...CONFIG, balance: 50, eligibleAmount: 300_000 })
    ).toBe(50);
  });

  it("rounds down to the step", () => {
    // 30% of 157.000 = 47.100đ = 47.1 points, stepped down to 40
    expect(
      computeMaxRedeemablePoints({ ...CONFIG, balance: 500, eligibleAmount: 157_000 })
    ).toBe(40);
  });

  it("returns 0 below the minimum", () => {
    // 30% of 20.000 = 6.000đ = 6 points, under a minimum of 10
    expect(
      computeMaxRedeemablePoints({ ...CONFIG, balance: 500, eligibleAmount: 20_000 })
    ).toBe(0);
  });

  it("shrinks the allowance when a voucher shrinks the bill", () => {
    // This is the whole reason the cap is applied post-voucher: otherwise a
    // voucher and points could together discount more than intended.
    const withoutVoucher = computeMaxRedeemablePoints({
      ...CONFIG,
      balance: 1000,
      eligibleAmount: 1_000_000,
    });
    const withVoucher = computeMaxRedeemablePoints({
      ...CONFIG,
      balance: 1000,
      eligibleAmount: 500_000,
    });
    expect(withoutVoucher).toBe(300);
    expect(withVoucher).toBe(150);
  });

  it("returns 0 for an empty basket or zero balance", () => {
    expect(
      computeMaxRedeemablePoints({ ...CONFIG, balance: 500, eligibleAmount: 0 })
    ).toBe(0);
    expect(
      computeMaxRedeemablePoints({ ...CONFIG, balance: 0, eligibleAmount: 300_000 })
    ).toBe(0);
  });

  it("returns 0 when redeeming is switched off (no cap configured)", () => {
    expect(
      computeMaxRedeemablePoints({
        ...CONFIG,
        maxPercent: 0,
        balance: 500,
        eligibleAmount: 300_000,
      })
    ).toBe(0);
  });

  it("never returns more than the balance even with a huge basket", () => {
    expect(
      computeMaxRedeemablePoints({
        ...CONFIG,
        balance: 30,
        eligibleAmount: 100_000_000,
      })
    ).toBe(30);
  });

  it("tolerates being called with nothing", () => {
    expect(computeMaxRedeemablePoints()).toBe(0);
  });
});

describe("point/VND conversion", () => {
  it("converts points to money", () => {
    expect(pointsToVnd(50)).toBe(50_000);
    expect(pointsToVnd(0)).toBe(0);
    // Never credits a negative discount.
    expect(pointsToVnd(-10)).toBe(0);
  });

  it("converts money to points, rounding down", () => {
    expect(vndToPoints(50_000)).toBe(50);
    expect(vndToPoints(50_999)).toBe(50);
  });
});

describe("labels", () => {
  it("names a tier from a key or an object", () => {
    expect(tierLabel("gold")).toBe("Vàng");
    expect(tierLabel({ key: "diamond", label: "Kim cương" })).toBe("Kim cương");
    // An unknown key falls back to itself rather than rendering blank.
    expect(tierLabel("platinum")).toBe("platinum");
    expect(tierLabel(null)).toBe("");
  });

  it("describes a voucher's value", () => {
    expect(voucherValueLabel({ type: "fixed", value: 20000 })).toBe("Giảm 20.000đ");
    expect(voucherValueLabel({ type: "percent", value: 10 })).toBe("Giảm 10%");
    expect(
      voucherValueLabel({ type: "percent", value: 10, maxDiscount: 50000 })
    ).toBe("Giảm 10% (tối đa 50.000đ)");
  });

  it("names ledger movement types in Vietnamese", () => {
    expect(pointEntryLabel("EARN")).toBe("Tích điểm");
    expect(pointEntryLabel("REDEEM_GIFT")).toBe("Đổi quà");
    expect(pointEntryLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});
