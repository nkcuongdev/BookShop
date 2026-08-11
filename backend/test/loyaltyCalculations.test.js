process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  eligibleAmountForOrder,
  computeEarnPoints,
  computeMaxRedeemablePoints,
  resolveTier,
  resolveTierByKey,
} = require("../src/services/loyaltyService");

const CONFIG = {
  enabled: true,
  earnRate: 10_000,
  redeemEnabled: true,
  redeemRate: 1_000,
  redeemMinPoints: 10,
  redeemMaxPercent: 30,
  redeemStep: 10,
  tiers: [
    { key: "silver", label: "Bạc", threshold: 0, multiplier: 1 },
    { key: "gold", label: "Vàng", threshold: 5_000_000, multiplier: 1.2 },
    { key: "diamond", label: "Kim cương", threshold: 20_000_000, multiplier: 1.5 },
  ],
};

// ──────────────────────────────────────────────────────────────
// eligibleAmountForOrder
//
// The six combinations exist because `discountAmount` already contains
// `shippingDiscountAmount`. Getting this wrong double-counts a shipping
// voucher against the goods total, which silently underpays every customer
// who used one.
// ──────────────────────────────────────────────────────────────

test("eligible amount: plain order is just the subtotal", () => {
  const order = { subtotal: 500_000, shippingFee: 25_000 };
  assert.equal(eligibleAmountForOrder(order), 500_000);
});

test("eligible amount: order voucher reduces the goods total", () => {
  const order = {
    subtotal: 500_000,
    discountAmount: 50_000,
    shippingDiscountAmount: 0,
    shippingFee: 25_000,
  };
  assert.equal(eligibleAmountForOrder(order), 450_000);
});

test("eligible amount: shipping voucher does not touch the goods total", () => {
  // discountAmount carries the shipping discount too, so a naive subtraction
  // would wrongly return 475.000.
  const order = {
    subtotal: 500_000,
    discountAmount: 25_000,
    shippingDiscountAmount: 25_000,
    shippingFee: 25_000,
  };
  assert.equal(eligibleAmountForOrder(order), 500_000);
});

test("eligible amount: both vouchers subtract only the order-scoped half", () => {
  const order = {
    subtotal: 500_000,
    discountAmount: 75_000, // 50.000 order + 25.000 shipping
    shippingDiscountAmount: 25_000,
    shippingFee: 25_000,
  };
  assert.equal(eligibleAmountForOrder(order), 450_000);
});

test("eligible amount: points already spent are excluded", () => {
  // Otherwise points spent on an order would earn points back.
  const order = {
    subtotal: 500_000,
    pointsDiscountAmount: 50_000,
    shippingFee: 25_000,
  };
  assert.equal(eligibleAmountForOrder(order), 450_000);
});

test("eligible amount: vouchers and points together", () => {
  const order = {
    subtotal: 500_000,
    discountAmount: 75_000,
    shippingDiscountAmount: 25_000,
    pointsDiscountAmount: 30_000,
    shippingFee: 25_000,
  };
  assert.equal(eligibleAmountForOrder(order), 420_000);
});

test("eligible amount never goes negative", () => {
  const order = {
    subtotal: 100_000,
    discountAmount: 90_000,
    pointsDiscountAmount: 50_000,
  };
  assert.equal(eligibleAmountForOrder(order), 0);
});

test("eligible amount tolerates a missing/empty order", () => {
  assert.equal(eligibleAmountForOrder({}), 0);
  assert.equal(eligibleAmountForOrder(null), 0);
});

// ──────────────────────────────────────────────────────────────
// computeEarnPoints
// ──────────────────────────────────────────────────────────────

test("earn points: base tier earns one point per earnRate", () => {
  assert.equal(computeEarnPoints(500_000, CONFIG, CONFIG.tiers[0]), 50);
});

test("earn points: tier multiplier applies", () => {
  assert.equal(computeEarnPoints(500_000, CONFIG, CONFIG.tiers[1]), 60); // ×1.2
  assert.equal(computeEarnPoints(500_000, CONFIG, CONFIG.tiers[2]), 75); // ×1.5
});

test("earn points always round down", () => {
  // 59.999đ at 10.000đ/point is 5.9999 points, not 6.
  assert.equal(computeEarnPoints(59_999, CONFIG, CONFIG.tiers[0]), 5);
  // 105.000đ × 1.2 = 12.6 points.
  assert.equal(computeEarnPoints(105_000, CONFIG, CONFIG.tiers[1]), 12);
});

test("earn points: nothing earned when the programme is off", () => {
  assert.equal(
    computeEarnPoints(500_000, { ...CONFIG, enabled: false }, CONFIG.tiers[0]),
    0
  );
});

test("earn points: zero or missing spend earns nothing", () => {
  assert.equal(computeEarnPoints(0, CONFIG, CONFIG.tiers[0]), 0);
  assert.equal(computeEarnPoints(-100, CONFIG, CONFIG.tiers[0]), 0);
});

test("earn points: a missing tier falls back to a multiplier of 1", () => {
  assert.equal(computeEarnPoints(500_000, CONFIG, null), 50);
});

// ──────────────────────────────────────────────────────────────
// computeMaxRedeemablePoints
// ──────────────────────────────────────────────────────────────

test("max redeemable: limited by the percentage cap", () => {
  // 30% of 300.000 = 90.000đ = 90 points, well under the balance.
  const max = computeMaxRedeemablePoints({
    balance: 500,
    eligibleAmount: 300_000,
    config: CONFIG,
  });
  assert.equal(max, 90);
});

test("max redeemable: limited by the balance", () => {
  const max = computeMaxRedeemablePoints({
    balance: 50,
    eligibleAmount: 300_000,
    config: CONFIG,
  });
  assert.equal(max, 50);
});

test("max redeemable: rounded down to the step", () => {
  // 30% of 157.000 = 47.100đ = 47.1 points, stepped down to 40.
  const max = computeMaxRedeemablePoints({
    balance: 500,
    eligibleAmount: 157_000,
    config: CONFIG,
  });
  assert.equal(max, 40);
});

test("max redeemable: returns 0 below the minimum", () => {
  // 30% of 20.000 = 6.000đ = 6 points, under redeemMinPoints of 10.
  const max = computeMaxRedeemablePoints({
    balance: 500,
    eligibleAmount: 20_000,
    config: CONFIG,
  });
  assert.equal(max, 0);
});

test("max redeemable: the cap follows the post-voucher amount", () => {
  // A voucher shrinking the goods total must shrink the ceiling with it,
  // otherwise a voucher and points could stack past the intended limit.
  const before = computeMaxRedeemablePoints({
    balance: 1000,
    eligibleAmount: 1_000_000,
    config: CONFIG,
  });
  const after = computeMaxRedeemablePoints({
    balance: 1000,
    eligibleAmount: 500_000,
    config: CONFIG,
  });
  assert.equal(before, 300);
  assert.equal(after, 150);
});

test("max redeemable: zero when redeeming is disabled", () => {
  assert.equal(
    computeMaxRedeemablePoints({
      balance: 500,
      eligibleAmount: 300_000,
      config: { ...CONFIG, redeemEnabled: false },
    }),
    0
  );
  assert.equal(
    computeMaxRedeemablePoints({
      balance: 500,
      eligibleAmount: 300_000,
      config: { ...CONFIG, enabled: false },
    }),
    0
  );
});

test("max redeemable: zero balance yields zero", () => {
  assert.equal(
    computeMaxRedeemablePoints({
      balance: 0,
      eligibleAmount: 300_000,
      config: CONFIG,
    }),
    0
  );
});

// ──────────────────────────────────────────────────────────────
// resolveTier
// ──────────────────────────────────────────────────────────────

test("resolve tier picks the highest threshold cleared", () => {
  assert.equal(resolveTier(0, CONFIG).key, "silver");
  assert.equal(resolveTier(4_999_999, CONFIG).key, "silver");
  assert.equal(resolveTier(5_000_000, CONFIG).key, "gold");
  assert.equal(resolveTier(19_999_999, CONFIG).key, "gold");
  assert.equal(resolveTier(20_000_000, CONFIG).key, "diamond");
  assert.equal(resolveTier(99_000_000, CONFIG).key, "diamond");
});

test("resolve tier returns null when no ladder is configured", () => {
  assert.equal(resolveTier(1_000_000, { ...CONFIG, tiers: [] }), null);
});

test("resolve tier by key falls back to the base tier", () => {
  assert.equal(resolveTierByKey("gold", CONFIG).key, "gold");
  assert.equal(resolveTierByKey("", CONFIG).key, "silver");
  // An unknown key must not grant a better multiplier than the customer has.
  assert.equal(resolveTierByKey("platinum", CONFIG).key, "silver");
});
