// Pure loyalty maths, kept free of React so both the checkout summary and its
// tests can use it directly.
//
// The server owns these rules; this file exists so the UI can show a figure
// that matches what the server will accept, not so it can decide anything.

/** VND knocked off the bill per point. Mirrors LoyaltyProgram.redeemRate. */
export const POINT_VALUE_VND = 1000;

export function pointsToVnd(points, rate = POINT_VALUE_VND) {
  return Math.max(0, Math.floor(Number(points) || 0)) * rate;
}

export function vndToPoints(amount, rate = POINT_VALUE_VND) {
  if (rate <= 0) return 0;
  return Math.floor(Math.max(0, Number(amount) || 0) / rate);
}

/**
 * Most points this basket can absorb.
 *
 * `eligibleAmount` is the goods total *after* the order voucher and without
 * shipping. Applying the cap to the pre-voucher figure would let a voucher and
 * points stack past the intended ceiling, so a voucher shrinking the bill has
 * to shrink the points allowance with it.
 *
 * Mirrors loyaltyService.computeMaxRedeemablePoints on the server; the two must
 * agree, or the customer sees an amount their order is then refused for.
 */
export function computeMaxRedeemablePoints({
  balance = 0,
  eligibleAmount = 0,
  maxPercent = 0,
  rate = POINT_VALUE_VND,
  step = 1,
  minPoints = 0,
} = {}) {
  if (rate <= 0 || maxPercent <= 0) return 0;

  const capAmount = Math.floor((Math.max(0, eligibleAmount) * maxPercent) / 100);
  const capped = Math.min(
    Math.max(0, Math.floor(balance)),
    Math.floor(capAmount / rate)
  );
  const stepped = Math.floor(capped / Math.max(1, step)) * Math.max(1, step);
  return stepped >= minPoints ? stepped : 0;
}

/** Presentation metadata per tier, keyed to LoyaltyProgram's default ladder. */
export const TIER_META = {
  silver: { label: "Bạc", className: "bg-muted text-foreground ring-1 ring-border" },
  gold: { label: "Vàng", className: "bg-warning-muted text-warning-strong" },
  diamond: { label: "Kim cương", className: "bg-info-muted text-info-strong" },
};

export function tierLabel(tier) {
  if (!tier) return "";
  if (typeof tier === "string") return TIER_META[tier]?.label || tier;
  return tier.label || TIER_META[tier.key]?.label || tier.key || "";
}

/** Human label for a voucher's value, shared by the reward and voucher cards. */
export function voucherValueLabel(voucher) {
  if (!voucher) return "";
  if (voucher.type === "percent") {
    const cap = voucher.maxDiscount
      ? ` (tối đa ${voucher.maxDiscount.toLocaleString("vi-VN")}đ)`
      : "";
    return `Giảm ${voucher.value}%${cap}`;
  }
  return `Giảm ${Number(voucher.value || 0).toLocaleString("vi-VN")}đ`;
}

/** Vietnamese label for a ledger movement type. */
export const POINT_ENTRY_LABELS = {
  EARN: "Tích điểm",
  REDEEM_ORDER: "Dùng cho đơn hàng",
  REDEEM_GIFT: "Đổi quà",
  REFUND_ORDER: "Hoàn điểm",
  REVOKE: "Thu hồi điểm",
  EXPIRE: "Hết hạn",
  ADJUST: "Điều chỉnh",
};

export function pointEntryLabel(type) {
  return POINT_ENTRY_LABELS[type] || type || "";
}
