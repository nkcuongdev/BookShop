const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const SupportTicket = require("../models/SupportTicket");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const LoyaltyProgram = require("../models/LoyaltyProgram");
const LoyaltyGift = require("../models/LoyaltyGift");
const LoyaltyGiftRedemption = require("../models/LoyaltyGiftRedemption");
const LoyaltyDebtEvent = require("../models/LoyaltyDebtEvent");
const Voucher = require("../models/Voucher");
const { runInTransaction } = require("../utils/transaction");
const crypto = require("crypto");

const { EXPECTED_SIGN, MOVEMENT_TYPES } = LoyaltyLedger;
const { ORDER_STATUS } = Order;

class LoyaltyError extends Error {
  constructor(message, code = "LOYALTY_ERROR", statusCode = 400) {
    super(message);
    this.name = "LoyaltyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function optionsFor(session) {
  return session ? { session } : undefined;
}

function toObjectId(value) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

function getConfig(session = null) {
  return LoyaltyProgram.getConfig({ session });
}

// ──────────────────────────────────────────────────────────────
// Pure helpers — no I/O, so they can be unit tested on their own
// ──────────────────────────────────────────────────────────────

/**
 * The part of an order that earns points: what the customer actually paid for
 * the goods.
 *
 * `discountAmount` already includes `shippingDiscountAmount` (see createOrder),
 * so the order-scoped discount has to be recovered by subtracting the shipping
 * half back out — subtracting `discountAmount` wholesale would double-count a
 * shipping voucher against the goods.
 *
 * Shipping is excluded entirely: a customer far from the warehouse should not
 * earn more points than a near one for the same books.
 *
 * Points already spent are excluded too. Without that, points spent on an order
 * would earn points back, a slow loop that mints value from nothing.
 */
function eligibleAmountForOrder(order) {
  const subtotal = Number(order?.subtotal) || 0;
  const totalDiscount = Number(order?.discountAmount) || 0;
  const shippingDiscount = Number(order?.shippingDiscountAmount) || 0;
  const orderDiscount = Math.max(0, totalDiscount - shippingDiscount);
  const pointsDiscount = Number(order?.pointsDiscountAmount) || 0;
  return Math.max(0, subtotal - orderDiscount - pointsDiscount);
}

/**
 * Points earned for a given spend. Always rounds down: the programme never
 * grants a fraction of a point it did not sell.
 */
function computeEarnPoints(eligibleAmount, config, tier) {
  const amount = Number(eligibleAmount) || 0;
  if (!config?.enabled || amount <= 0) return 0;
  const rate = Number(config.earnRate) || 0;
  if (rate <= 0) return 0;
  const multiplier = Number(tier?.multiplier) || 1;
  return Math.floor((amount / rate) * multiplier);
}

/**
 * Highest tier whose threshold the spend has cleared. Relies on `tiers` being
 * sorted ascending, which LoyaltyProgram guarantees on save.
 */
function resolveTier(spend, config) {
  const tiers = config?.tiers || [];
  if (tiers.length === 0) return null;
  let matched = tiers[0];
  for (const tier of tiers) {
    if (spend >= tier.threshold) matched = tier;
    else break;
  }
  return matched;
}

function resolveTierByKey(key, config) {
  const tiers = config?.tiers || [];
  if (!key) return tiers[0] || null;
  return tiers.find((tier) => tier.key === key) || tiers[0] || null;
}

/**
 * Largest number of points spendable on an order, honouring balance, the
 * percentage cap and the step size.
 *
 * `eligibleAmount` is the goods total net of order vouchers: the cap limits how
 * much of what the customer actually owes may be paid with points, so applying
 * it to the pre-voucher figure would let a voucher and points stack past the
 * intended ceiling.
 */
function computeMaxRedeemablePoints({ balance = 0, eligibleAmount = 0, config }) {
  if (!config?.enabled || !config?.redeemEnabled) return 0;
  const rate = Number(config.redeemRate) || 0;
  const step = Number(config.redeemStep) || 1;
  if (rate <= 0) return 0;

  const capAmount = Math.floor(
    (Math.max(0, eligibleAmount) * config.redeemMaxPercent) / 100
  );
  const capped = Math.min(Math.max(0, balance), Math.floor(capAmount / rate));
  const stepped = Math.floor(capped / step) * step;
  return stepped >= config.redeemMinPoints ? stepped : 0;
}

// ──────────────────────────────────────────────────────────────
// Core: the single entry point for every points movement
// ──────────────────────────────────────────────────────────────

/**
 * Writes the ledger row and moves User.loyalty.pointsBalance together.
 *
 * As in inventoryService.applyMovement, the "balance cannot go negative" guard
 * lives inside the update filter, so two concurrent spenders cannot both pass a
 * read-then-write check: the second one simply matches no document.
 *
 * @returns {Promise<{user: object, ledger: object}>}
 */
async function applyPointsMovement(input, session = null) {
  const {
    userId,
    type,
    points,
    refType = null,
    refId = null,
    refCode = "",
    reason = "",
    performedBy = null,
    earnBasis = null,
    uniqueKey = null,
    expiresAt = null,
  } = input;

  if (!MOVEMENT_TYPES.includes(type)) {
    throw new LoyaltyError(
      `Loại biến động điểm không hợp lệ: ${type}`,
      "INVALID_MOVEMENT_TYPE"
    );
  }

  const signed = Number(points);
  if (!Number.isInteger(signed) || signed === 0) {
    throw new LoyaltyError("Số điểm phải là số nguyên khác 0", "INVALID_POINTS");
  }

  const expectedSign = EXPECTED_SIGN[type];
  if (expectedSign !== 0 && Math.sign(signed) !== expectedSign) {
    throw new LoyaltyError(
      `Dấu của số điểm không khớp loại biến động ${type}`,
      "INVALID_POINTS_SIGN"
    );
  }

  if (type === "ADJUST" && !String(reason || "").trim()) {
    throw new LoyaltyError("Điều chỉnh điểm bắt buộc có lý do", "REASON_REQUIRED");
  }

  // A movement carrying a uniqueKey can fail at the ledger insert after the
  // balance has already moved. Only a transaction can undo that, so refuse to
  // run one without a session rather than risk a silent drift.
  if (uniqueKey && !session) {
    throw new LoyaltyError(
      "Biến động điểm có uniqueKey phải chạy trong transaction",
      "SESSION_REQUIRED",
      500
    );
  }

  const before = await User.findOne({ _id: userId })
    .select("loyalty.pointsBalance name email")
    .session(session || null)
    .lean();
  if (!before) {
    throw new LoyaltyError("Không tìm thấy người dùng", "USER_NOT_FOUND", 404);
  }
  const balanceBefore = Number(before.loyalty?.pointsBalance) || 0;

  const filter =
    signed > 0
      ? { _id: userId }
      : { _id: userId, "loyalty.pointsBalance": { $gte: -signed } };

  const inc = { "loyalty.pointsBalance": signed };
  if (signed > 0) inc["loyalty.lifetimeEarned"] = signed;
  else inc["loyalty.lifetimeRedeemed"] = -signed;

  const user = await User.findOneAndUpdate(
    filter,
    { $inc: inc, $set: { "loyalty.lastActivityAt": new Date() } },
    { returnDocument: "after", ...optionsFor(session) }
  ).select("loyalty name email");

  if (!user) {
    throw new LoyaltyError(
      `Số dư điểm không đủ (còn ${balanceBefore}, cần ${-signed})`,
      "INSUFFICIENT_POINTS",
      409
    );
  }

  try {
    const [ledger] = await LoyaltyLedger.create(
      [
        {
          user: toObjectId(userId),
          type,
          points: signed,
          balanceBefore,
          balanceAfter: user.loyalty.pointsBalance,
          earnBasis: earnBasis || undefined,
          refType,
          refId,
          refCode,
          reason,
          performedBy,
          uniqueKey,
          expiresAt,
        },
      ],
      optionsFor(session)
    );
    return { user, ledger };
  } catch (error) {
    if (error?.code === 11000) {
      // The uniqueKey already exists: an earlier run recorded this movement.
      // Throwing rolls back the balance change above with the transaction.
      throw new LoyaltyError(
        "Biến động điểm này đã được ghi nhận",
        "DUPLICATE_MOVEMENT",
        409
      );
    }
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────
// Order integration
// ──────────────────────────────────────────────────────────────

/**
 * Grant points for a delivered order.
 *
 * Idempotent three ways: the caller's `pointsEarnedAt` marker, the ledger's
 * uniqueKey, and the status guard. The marker is the cheap check; the uniqueKey
 * is the one that holds even if a call site forgets to select the marker.
 *
 * Mutates `order` and leaves saving to the caller, which is already saving it
 * inside the same transaction.
 *
 * Must run inside the caller's transaction.
 *
 * @returns {Promise<object|null>} the ledger row, or null when nothing was due.
 */
async function earnForOrder(order, session, { performedBy = null } = {}) {
  if (order.pointsEarnedAt) return null;
  if (order.status !== ORDER_STATUS.DELIVERED) return null;

  const config = await getConfig(session);
  if (!config.enabled) return null;

  const eligibleAmount = eligibleAmountForOrder(order);
  if (eligibleAmount <= 0) {
    // Nothing to grant, but mark it done so the order is not reconsidered.
    order.pointsEarnedAt = new Date();
    return null;
  }

  // Tier as it stands now: the nightly job keeps User.loyalty.tierKey current,
  // and reading it here is what makes the multiplier feel earned rather than
  // retroactive.
  const customer = await User.findById(order.user)
    .select("loyalty.tierKey loyalty.pointsDebt")
    .session(session)
    .lean();
  const tier = resolveTierByKey(customer?.loyalty?.tierKey, config);

  const points = computeEarnPoints(eligibleAmount, config, tier);
  if (points <= 0) {
    order.pointsEarnedAt = new Date();
    return null;
  }

  const debtOffset = Math.min(points, Number(customer?.loyalty?.pointsDebt) || 0);
  if (debtOffset > 0) {
    await applyDebtMovement({
      userId: order.user,
      type: "SETTLE",
      points: debtOffset,
      refType: "Order",
      refId: order._id,
      refCode: order.orderCode,
      reason: `Bù nợ điểm bằng điểm tích từ đơn ${order.orderCode}`,
      uniqueKey: `DEBT_SETTLE:Order:${order._id}`,
    }, session);
  }
  const spendablePoints = points - debtOffset;
  let ledger = null;
  if (spendablePoints > 0) {
    ({ ledger } = await applyPointsMovement({
      userId: order.user,
      type: "EARN",
      points: spendablePoints,
      refType: "Order",
      refId: order._id,
      refCode: order.orderCode,
      reason: `Tích ${points} điểm đơn ${order.orderCode}` +
        (debtOffset ? `; ${debtOffset} điểm dùng để bù nợ` : ""),
      performedBy,
      uniqueKey: `EARN:Order:${order._id}`,
      earnBasis: {
        eligibleAmount,
        baseRate: config.earnRate,
        tierKey: tier?.key || "",
        tierMultiplier: Number(tier?.multiplier) || 1,
      },
      expiresAt: config.expiryEnabled
        ? new Date(Date.now() + config.expiryDays * 86_400_000)
        : null,
    }, session));
  }

  order.pointsEarned = points;
  order.pointsEarnedAt = new Date();
  return ledger;
}

/**
 * Spend points on an order being created.
 *
 * Returns the discount so createOrder can fold it into the total. Throws rather
 * than silently clamping: the checkout screen already previewed a figure with
 * the same rules, so a mismatch means the basket moved underneath the customer
 * and they should be told, not quietly charged more.
 *
 * `eligibleAmount` is the goods total net of the order voucher, matching the
 * base the cap is defined against.
 *
 * Must run inside the caller's transaction.
 */
async function redeemForOrder(
  { userId, requestedPoints, eligibleAmount, orderId, orderCode },
  session
) {
  const points = Number(requestedPoints) || 0;
  if (points <= 0) return { points: 0, discountAmount: 0, rate: 0 };

  const config = await getConfig(session);
  if (!config.enabled || !config.redeemEnabled) {
    throw new LoyaltyError(
      "Chương trình đổi điểm đang tạm dừng",
      "REDEEM_DISABLED"
    );
  }
  if (!Number.isInteger(points)) {
    throw new LoyaltyError("Số điểm phải là số nguyên", "INVALID_POINTS");
  }
  if (points < config.redeemMinPoints) {
    throw new LoyaltyError(
      `Cần tối thiểu ${config.redeemMinPoints} điểm để sử dụng`,
      "BELOW_MIN_POINTS"
    );
  }
  if (points % config.redeemStep !== 0) {
    throw new LoyaltyError(
      `Số điểm phải là bội của ${config.redeemStep}`,
      "INVALID_POINTS_STEP"
    );
  }

  const capAmount = Math.floor(
    (Math.max(0, eligibleAmount) * config.redeemMaxPercent) / 100
  );
  const discountAmount = points * config.redeemRate;
  if (discountAmount > capAmount) {
    throw new LoyaltyError(
      `Chỉ được dùng điểm tối đa ${config.redeemMaxPercent}% giá trị hàng (${capAmount.toLocaleString("vi-VN")}đ)`,
      "REDEEM_CAP_EXCEEDED"
    );
  }

  await applyPointsMovement(
    {
      userId,
      type: "REDEEM_ORDER",
      points: -points,
      refType: "Order",
      refId: orderId,
      refCode: orderCode,
      reason: `Dùng điểm cho đơn ${orderCode}`,
      uniqueKey: `REDEEM_ORDER:Order:${orderId}`,
    },
    session
  );

  return { points, discountAmount, rate: config.redeemRate };
}

/**
 * Hand back points a customer spent on an order that did not complete —
 * cancelled, expired, failed payment or refunded.
 *
 * Sits alongside releaseOrderVoucher at every call site: same meaning, same
 * idempotency shape.
 */
async function refundOrderPoints(order, session, { reason = "" } = {}) {
  if (order.pointsRefundedAt) return null;
  const points = Number(order.pointsRedeemed) || 0;
  if (points <= 0) {
    order.pointsRefundedAt = new Date();
    return null;
  }

  const { ledger } = await applyPointsMovement(
    {
      userId: order.user,
      type: "REFUND_ORDER",
      points,
      refType: "Order",
      refId: order._id,
      refCode: order.orderCode,
      reason: reason || `Hoàn điểm đơn ${order.orderCode}`,
      uniqueKey: `REFUND_ORDER:Order:${order._id}`,
    },
    session
  );

  order.pointsRefundedAt = new Date();
  return ledger;
}

async function applyDebtMovement(
  { userId, type, points, refType, refId, refCode = "", reason = "", uniqueKey },
  session
) {
  if (!session) {
    throw new LoyaltyError(
      "Biến động nợ điểm phải chạy trong transaction",
      "SESSION_REQUIRED",
      500
    );
  }
  const amount = Number(points);
  if (!Number.isInteger(amount) || amount <= 0 || !["ACCRUE", "SETTLE"].includes(type)) {
    throw new LoyaltyError("Biến động nợ điểm không hợp lệ", "INVALID_DEBT_MOVEMENT");
  }
  const before = await User.findById(userId)
    .select("loyalty.pointsDebt")
    .session(session)
    .lean();
  if (!before) throw new LoyaltyError("Không tìm thấy người dùng", "USER_NOT_FOUND", 404);
  const debtBefore = Number(before.loyalty?.pointsDebt) || 0;
  const filter = type === "SETTLE"
    ? { _id: userId, "loyalty.pointsDebt": { $gte: amount } }
    : { _id: userId };
  const counter = type === "ACCRUE"
    ? "loyalty.lifetimeDebtAccrued"
    : "loyalty.lifetimeDebtSettled";
  const user = await User.findOneAndUpdate(
    filter,
    {
      $inc: { "loyalty.pointsDebt": type === "ACCRUE" ? amount : -amount, [counter]: amount },
      $set: { "loyalty.lastActivityAt": new Date() },
    },
    { returnDocument: "after", session }
  ).select("loyalty");
  if (!user) throw new LoyaltyError("Nợ điểm đã thay đổi, vui lòng thử lại", "DEBT_CONFLICT", 409);
  const [event] = await LoyaltyDebtEvent.create([{
    user: userId,
    type,
    points: amount,
    debtBefore,
    debtAfter: Number(user.loyalty?.pointsDebt) || 0,
    refType,
    refId,
    refCode,
    reason,
    uniqueKey,
  }], { session });
  return event;
}

/** Restore the share of checkout points paid for goods that were returned. */
async function refundOrderPointsPartial(
  order,
  { returnedGrossAmount, returnId, returnCode = "" },
  session
) {
  const redeemed = Number(order.pointsRedeemed) || 0;
  const subtotal = Number(order.subtotal) || 0;
  if (redeemed <= 0 || subtotal <= 0) return null;

  const ratio = Math.min(
    1,
    Math.max(0, Number(returnedGrossAmount) || 0) / subtotal
  );
  const points = Math.floor(redeemed * ratio);
  if (points <= 0) return null;

  const { ledger } = await applyPointsMovement(
    {
      userId: order.user,
      type: "REFUND_ORDER",
      points,
      refType: "Order",
      refId: order._id,
      refCode: order.orderCode,
      reason:
        `Hoàn điểm đã dùng cho hàng trả của đơn ${order.orderCode}` +
        (returnCode ? ` (${returnCode})` : ""),
      uniqueKey: `REFUND_ORDER:Return:${returnId}`,
    },
    session
  );
  return ledger;
}

/**
 * Claw back points granted for an order that has since been refunded.
 *
 * The balance may already have been spent. Going negative is barred by the
 * schema, and refusing outright would let a customer keep points for goods they
 * returned, so this takes back whatever is left and records the shortfall in
 * the reason for support to see.
 */
async function revokeOrderPoints(order, session, { reason = "" } = {}) {
  if (order.pointsRevokedAt) return null;
  const earned = Number(order.pointsEarned) || 0;
  if (earned <= 0) {
    order.pointsRevokedAt = new Date();
    return null;
  }

  const customer = await User.findById(order.user)
    .select("loyalty.pointsBalance")
    .session(session)
    .lean();
  const balance = Number(customer?.loyalty?.pointsBalance) || 0;
  const revocable = Math.min(earned, balance);
  const shortfall = earned - revocable;
  let ledger = null;
  if (revocable > 0) {
    ({ ledger } = await applyPointsMovement({
      userId: order.user,
      type: "REVOKE",
      points: -revocable,
      refType: "Order",
      refId: order._id,
      refCode: order.orderCode,
      // The shortfall note is appended rather than folded into the default,
      // because every caller passes a reason of its own — leaving it in the
      // fallback meant the one piece of information support actually needs was
      // never written.
      reason:
        (reason || `Thu hồi điểm đơn ${order.orderCode} do hoàn tiền`) +
        (shortfall ? ` (thiếu ${shortfall} điểm do số dư không đủ)` : ""),
      uniqueKey: `REVOKE:Order:${order._id}`,
    }, session));
  }
  if (shortfall > 0) {
    await applyDebtMovement({
      userId: order.user,
      type: "ACCRUE",
      points: shortfall,
      refType: "Order",
      refId: order._id,
      refCode: order.orderCode,
      reason: `Ghi nợ phần điểm thiếu khi hoàn đơn ${order.orderCode}`,
      uniqueKey: `DEBT_ACCRUE:Order:${order._id}`,
    }, session);
  }

  order.pointsRevokedAt = new Date();
  return ledger;
}

/**
 * Claw back part of the points an order earned, in proportion to how much of
 * the goods value came back.
 *
 * Returns are partial by nature, so a whole-order revoke would overcharge a
 * customer who sent back one book out of five. The ratio is taken against the
 * order's eligible amount, the same base the points were granted on, so a
 * full return converges on the full grant.
 *
 * Uses its own uniqueKey namespace keyed by the return, because one order can
 * accumulate several returns over time.
 */
async function revokeOrderPointsPartial(
  order,
  { refundedGoodsAmount, returnId, returnCode = "" },
  session
) {
  const earned = Number(order.pointsEarned) || 0;
  if (earned <= 0) return null;

  const eligibleAmount = eligibleAmountForOrder(order);
  if (eligibleAmount <= 0) return null;

  const ratio = Math.min(
    1,
    Math.max(0, Number(refundedGoodsAmount) || 0) / eligibleAmount
  );
  // Round down: never claw back more than the return actually justifies.
  const target = Math.floor(earned * ratio);
  if (target <= 0) return null;

  const customer = await User.findById(order.user)
    .select("loyalty.pointsBalance")
    .session(session)
    .lean();
  const balance = Number(customer?.loyalty?.pointsBalance) || 0;
  const revocable = Math.min(target, balance);
  const shortfall = target - revocable;
  let ledger = null;
  if (revocable > 0) {
    ({ ledger } = await applyPointsMovement({
      userId: order.user,
      type: "REVOKE",
      points: -revocable,
      refType: "Order",
      refId: order._id,
      refCode: order.orderCode,
      reason:
        `Thu hồi điểm đơn ${order.orderCode} do trả hàng` +
        (returnCode ? ` (${returnCode})` : "") +
        (shortfall ? ` — thiếu ${shortfall} điểm do số dư không đủ` : ""),
      uniqueKey: `REVOKE:Return:${returnId}`,
    }, session));
  }
  if (shortfall > 0) {
    await applyDebtMovement({
      userId: order.user,
      type: "ACCRUE",
      points: shortfall,
      refType: "Return",
      refId: mongoose.isValidObjectId(returnId) ? returnId : order._id,
      refCode: returnCode || order.orderCode,
      reason: `Ghi nợ phần điểm thiếu do trả hàng đơn ${order.orderCode}`,
      uniqueKey: `DEBT_ACCRUE:Return:${returnId}`,
    }, session);
  }
  return ledger;
}

// ──────────────────────────────────────────────────────────────
// Gift catalogue: trading points for a voucher
// ──────────────────────────────────────────────────────────────

/**
 * Mint a code nobody else holds.
 *
 * Voucher.code allows 40 characters of [A-Z0-9_]; the gift code is capped at 20
 * so the minted code always fits. Collisions are astronomically unlikely but
 * retried anyway, because the unique index would otherwise fail the whole
 * redemption.
 */
async function generateGiftVoucherCode(giftCode, session) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
    const code = "GIFT_" + giftCode + "_" + suffix;
    const existing = await Voucher.findOne({ code })
      .select("_id")
      .session(session || null)
      .lean();
    if (!existing) return code;
  }
  throw new LoyaltyError(
    "Không tạo được mã voucher, vui lòng thử lại",
    "VOUCHER_CODE_COLLISION",
    500
  );
}

/**
 * Exchange points for a voucher minted for this customer alone.
 *
 * The order of operations matters. Stock is claimed first with a conditional
 * update, the voucher is minted next, and points are taken last — so a customer
 * who turns out not to afford it rolls back a claim that was never really made,
 * rather than losing points to a gift they did not receive.
 *
 * The minted voucher is an ordinary Voucher, which is what keeps the checkout
 * path untouched: it validates, consumes and releases exactly like any other
 * code, including being handed back if the order is later cancelled.
 */
async function redeemGift({ userId, giftId }) {
  return runInTransaction(async (session) => {
    const now = new Date();
    const config = await getConfig(session);
    if (!config.enabled) {
      throw new LoyaltyError(
        "Chương trình điểm thưởng đang tạm dừng",
        "LOYALTY_DISABLED"
      );
    }

    // Claim a unit up front: the same conditional-update trick consumeVoucher
    // uses, so two simultaneous redemptions of the last item cannot both win.
    const gift = await LoyaltyGift.findOneAndUpdate(
      {
        _id: giftId,
        active: true,
        $and: [
          { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
          { $or: [{ endAt: null }, { endAt: { $gt: now } }] },
          {
            $or: [{ stock: 0 }, { $expr: { $lt: ["$issuedCount", "$stock"] } }],
          },
        ],
      },
      { $inc: { issuedCount: 1 } },
      { returnDocument: "after", session }
    );
    if (!gift) {
      throw new LoyaltyError("Quà này không còn khả dụng", "GIFT_UNAVAILABLE", 409);
    }

    const used = await LoyaltyGiftRedemption.countDocuments({
      gift: gift._id,
      user: userId,
    }).session(session);
    if (used >= gift.perUserLimit) {
      throw new LoyaltyError(
        "Bạn đã đổi hết số lượt của quà này",
        "GIFT_USER_LIMIT",
        409
      );
    }

    if (gift.minTierKey) {
      const customer = await User.findById(userId)
        .select("loyalty.tierKey")
        .session(session)
        .lean();
      const userTier = resolveTierByKey(customer?.loyalty?.tierKey, config);
      const needTier = resolveTierByKey(gift.minTierKey, config);
      if (!userTier || !needTier || userTier.threshold < needTier.threshold) {
        throw new LoyaltyError(
          "Quà này dành cho hạng " + (needTier?.label || gift.minTierKey) + " trở lên",
          "GIFT_TIER_REQUIRED",
          403
        );
      }
    }

    const template = gift.voucherTemplate;
    const code = await generateGiftVoucherCode(gift.code, session);
    const endAt = new Date(now.getTime() + template.validDays * 86_400_000);
    const [voucher] = await Voucher.create(
      [
        {
          code,
          type: template.type,
          scope: template.scope,
          value: template.value,
          minOrder: template.minOrder,
          maxDiscount: template.maxDiscount,
          startAt: now,
          endAt,
          // Single use by a single person: this code belongs to whoever paid
          // the points for it.
          usageLimit: 1,
          perUserLimit: 1,
          active: true,
          publicVisible: false,
          description: "Đổi từ " + gift.pointsCost + " điểm — " + gift.name,
        },
      ],
      { session }
    );

    // Points last: if the balance falls short, everything above unwinds.
    const { ledger } = await applyPointsMovement(
      {
        userId,
        type: "REDEEM_GIFT",
        points: -gift.pointsCost,
        refType: "Voucher",
        refId: voucher._id,
        refCode: voucher.code,
        reason: "Đổi quà: " + gift.name,
        uniqueKey: "REDEEM_GIFT:Voucher:" + voucher._id,
      },
      session
    );

    const [redemption] = await LoyaltyGiftRedemption.create(
      [
        {
          gift: gift._id,
          user: userId,
          voucher: voucher._id,
          voucherCode: voucher.code,
          pointsSpent: gift.pointsCost,
          ledgerEntry: ledger._id,
          expiresAt: endAt,
        },
      ],
      { session }
    );

    return { gift, voucher, redemption, ledger };
  });
}

/** The catalogue as one customer sees it, with affordability resolved. */
async function listGifts({ userId, page = 1, limit = 20 }) {
  const now = new Date();
  const config = await getConfig();
  const filter = {
    active: true,
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gt: now } }] },
    ],
  };

  const skip = (page - 1) * limit;
  const [gifts, total, user] = await Promise.all([
    LoyaltyGift.find(filter)
      .sort({ sortOrder: 1, pointsCost: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LoyaltyGift.countDocuments(filter),
    User.findById(userId).select("loyalty.pointsBalance loyalty.tierKey").lean(),
  ]);

  const balance = Number(user?.loyalty?.pointsBalance) || 0;
  const userTier = resolveTierByKey(user?.loyalty?.tierKey, config);

  const giftIds = gifts.map((gift) => gift._id);
  const usedRows = giftIds.length
    ? await LoyaltyGiftRedemption.aggregate([
        { $match: { user: toObjectId(userId), gift: { $in: giftIds } } },
        { $group: { _id: "$gift", count: { $sum: 1 } } },
      ])
    : [];
  const usedByGift = new Map(usedRows.map((row) => [String(row._id), row.count]));

  return {
    balance,
    gifts: gifts.map((gift) => {
      const remaining =
        gift.stock > 0 ? Math.max(0, gift.stock - gift.issuedCount) : null;
      const used = usedByGift.get(String(gift._id)) || 0;
      const needTier = gift.minTierKey
        ? resolveTierByKey(gift.minTierKey, config)
        : null;
      const tierOk =
        !needTier || (userTier && userTier.threshold >= needTier.threshold);

      let ineligibleReason = "";
      if (remaining === 0) ineligibleReason = "Đã hết";
      else if (used >= gift.perUserLimit) ineligibleReason = "Bạn đã đổi hết lượt";
      else if (!tierOk) ineligibleReason = "Dành cho hạng " + needTier.label + " trở lên";
      else if (balance < gift.pointsCost) ineligibleReason = "Không đủ điểm";

      return {
        id: gift._id,
        _id: gift._id,
        code: gift.code,
        name: gift.name,
        description: gift.description,
        imageUrl: gift.imageUrl,
        pointsCost: gift.pointsCost,
        minTierKey: gift.minTierKey,
        minTierLabel: needTier?.label || "",
        voucher: {
          type: gift.voucherTemplate.type,
          scope: gift.voucherTemplate.scope,
          value: gift.voucherTemplate.value,
          minOrder: gift.voucherTemplate.minOrder,
          maxDiscount: gift.voucherTemplate.maxDiscount,
          validDays: gift.voucherTemplate.validDays,
        },
        remaining,
        perUserLimit: gift.perUserLimit,
        usedByMe: used,
        affordable: balance >= gift.pointsCost,
        eligible: !ineligibleReason,
        ineligibleReason,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/** Vouchers this customer has already traded points for. */
async function listMyRedemptions(
  userId,
  { status = "", page = 1, limit = 20 } = {}
) {
  const now = new Date();
  const filter = { user: toObjectId(userId) };
  if (status === "active") filter.expiresAt = { $gt: now };
  else if (status === "expired") filter.expiresAt = { $lte: now };

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    LoyaltyGiftRedemption.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("gift", "name imageUrl")
      .populate(
        "voucher",
        "code type scope value minOrder maxDiscount usedCount active endAt"
      )
      .lean(),
    LoyaltyGiftRedemption.countDocuments(filter),
  ]);

  return {
    redemptions: rows.map((row) => {
      const spent = Number(row.voucher?.usedCount) > 0;
      const expired = row.expiresAt <= now;
      return {
        id: row._id,
        _id: row._id,
        giftName: row.gift?.name || "",
        imageUrl: row.gift?.imageUrl || "",
        voucherCode: row.voucherCode,
        voucher: row.voucher
          ? {
              type: row.voucher.type,
              scope: row.voucher.scope,
              value: row.voucher.value,
              minOrder: row.voucher.minOrder,
              maxDiscount: row.voucher.maxDiscount,
            }
          : null,
        pointsSpent: row.pointsSpent,
        expiresAt: row.expiresAt,
        // "used" beats "expired": a code already spent is not a missed chance.
        status: spent ? "used" : expired ? "expired" : "active",
        createdAt: row.createdAt,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

// ──────────────────────────────────────────────────────────────
// Tier evaluation
// ──────────────────────────────────────────────────────────────

/**
 * Goods value of a delivered order, expressed as an aggregation expression.
 *
 * Mirrors eligibleAmountForOrder exactly. The duplication is deliberate: the
 * tier ladder and the earn formula must measure the same thing, and doing this
 * in the database avoids pulling every order into Node to add them up.
 */
function eligibleAmountExpr(prefix = "") {
  const field = (name) => `$${prefix}${name}`;
  return {
    $max: [
      0,
      {
        $subtract: [
          {
            $subtract: [
              { $ifNull: [field("subtotal"), 0] },
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      { $ifNull: [field("discountAmount"), 0] },
                      { $ifNull: [field("shippingDiscountAmount"), 0] },
                    ],
                  },
                ],
              },
            ],
          },
          { $ifNull: [field("pointsDiscountAmount"), 0] },
        ],
      },
    ],
  };
}

/**
 * Total goods spend for a batch of customers inside the rolling window.
 *
 * One aggregate for the whole batch rather than one per customer: the job
 * evaluates hundreds at a time, and the per-user version turns a single indexed
 * scan into hundreds of round trips.
 *
 * Fully refunded orders drop out for free, because a refund moves the order out
 * of DELIVERED. Completed partial returns and support refunds keep the order in
 * DELIVERED, so their cash value is deducted explicitly. Reships and guidance
 * do not reduce tier spend because the customer did not receive money back.
 *
 * @returns {Promise<Map<string, number>>} keyed by user id; absent means zero.
 */
async function computeSpendWindowBatch(userIds, windowDays, session = null) {
  if (!userIds.length) return new Map();
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await Order.aggregate([
    {
      $match: {
        user: { $in: userIds.map(toObjectId) },
        status: ORDER_STATUS.DELIVERED,
        deliveredAt: { $gte: since },
      },
    },
    {
      $lookup: {
        from: ReturnRequest.collection.name,
        localField: "_id",
        foreignField: "order",
        as: "completedReturns",
        pipeline: [
          {
            $match: {
              "refund.status": ReturnRequest.REFUND_STATUS.COMPLETED,
            },
          },
          { $project: { _id: 0, amount: { $ifNull: ["$refund.amount", 0] } } },
        ],
      },
    },
    {
      $lookup: {
        from: SupportTicket.collection.name,
        localField: "_id",
        foreignField: "order",
        as: "completedSupportRefunds",
        pipeline: [
          {
            $match: {
              "resolution.type": "PARTIAL_REFUND",
              "resolution.status": "REFUND_COMPLETED",
            },
          },
          {
            $project: {
              _id: 0,
              amount: { $ifNull: ["$resolution.amount", 0] },
            },
          },
        ],
      },
    },
    {
      $set: {
        afterSalesRefundAmount: {
          $add: [
            { $sum: "$completedReturns.amount" },
            { $sum: "$completedSupportRefunds.amount" },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$user",
        spend: {
          $sum: {
            $max: [
              0,
              {
                $subtract: [
                  eligibleAmountExpr(),
                  { $ifNull: ["$afterSalesRefundAmount", 0] },
                ],
              },
            ],
          },
        },
      },
    },
  ]).session(session || null);

  return new Map(rows.map((row) => [String(row._id), Math.max(0, Math.round(row.spend || 0))]));
}

/** Single-customer convenience wrapper, for the admin "recalculate" button. */
async function computeSpendWindow(userId, windowDays, session = null) {
  const map = await computeSpendWindowBatch([userId], windowDays, session);
  return map.get(String(userId)) || 0;
}

/**
 * Move one customer to the tier their spend justifies.
 *
 * Promotions take effect at once. Demotions are held for `tierGraceDays`: a
 * customer who has a quiet month should not bounce down and back up, and losing
 * a tier is the kind of change that generates a support ticket.
 *
 * Writes a single updateOne, which is atomic on its own — no transaction needed.
 */
async function recalcTier(userId, { session = null, now = new Date(), spend = null } = {}) {
  const config = await getConfig(session);
  if (!config.enabled) return { changed: false };

  const spend12m =
    spend === null
      ? await computeSpendWindow(userId, config.tierWindowDays, session)
      : spend;
  const target = resolveTier(spend12m, config);
  if (!target) return { changed: false };

  const user = await User.findById(userId).select("loyalty").session(session).lean();
  if (!user) return { changed: false };

  const currentKey = user.loyalty?.tierKey || "";
  const currentTier = currentKey ? resolveTierByKey(currentKey, config) : null;
  let nextKey = target.key;
  let validUntil = user.loyalty?.tierValidUntil || null;

  const isDemotion = Boolean(
    currentTier && target.threshold < currentTier.threshold
  );

  if (isDemotion && config.tierGraceDays > 0) {
    if (!validUntil) {
      // First time below the line: start the clock, keep the tier.
      validUntil = new Date(now.getTime() + config.tierGraceDays * 86_400_000);
      nextKey = currentKey;
    } else if (now < validUntil) {
      nextKey = currentKey;
    } else {
      validUntil = null; // Grace spent; the demotion stands.
    }
  } else {
    // Promoted, or holding steady: any pending demotion is moot.
    validUntil = null;
  }

  const changed = nextKey !== currentKey;
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        "loyalty.tierKey": nextKey,
        "loyalty.spend12m": spend12m,
        "loyalty.tierEvaluatedAt": now,
        "loyalty.tierValidUntil": validUntil,
      },
    },
    optionsFor(session)
  );

  return { changed, from: currentKey, to: nextKey, spend12m };
}

// ──────────────────────────────────────────────────────────────
// Reads for the customer-facing screens
// ──────────────────────────────────────────────────────────────

function serializeTier(tier) {
  if (!tier) return null;
  return {
    key: tier.key,
    label: tier.label,
    threshold: tier.threshold,
    multiplier: tier.multiplier,
    color: tier.color || "",
    benefits: tier.benefits || [],
  };
}

/**
 * Everything the "my points" screen needs in one round trip: balance, where the
 * customer sits on the ladder, and how far the next rung is.
 */
async function getSummary(userId) {
  const config = await getConfig();
  const user = await User.findById(userId).select("loyalty").lean();
  const loyalty = user?.loyalty || {};

  const spend12m = Number(loyalty.spend12m) || 0;
  const currentTier = resolveTierByKey(loyalty.tierKey, config);
  const tiers = config.tiers || [];
  const currentIndex = tiers.findIndex((t) => t.key === currentTier?.key);
  const nextTier = currentIndex >= 0 ? tiers[currentIndex + 1] || null : null;

  return {
    balance: Number(loyalty.pointsBalance) || 0,
    pointsDebt: Number(loyalty.pointsDebt) || 0,
    lifetimeEarned: Number(loyalty.lifetimeEarned) || 0,
    lifetimeRedeemed: Number(loyalty.lifetimeRedeemed) || 0,
    spend12m,
    tier: serializeTier(currentTier),
    nextTier: nextTier
      ? {
          ...serializeTier(nextTier),
          remaining: Math.max(0, nextTier.threshold - spend12m),
        }
      : null,
    tiers: tiers.map(serializeTier),
    tierValidUntil: loyalty.tierValidUntil || null,
    tierEvaluatedAt: loyalty.tierEvaluatedAt || null,
    program: {
      enabled: config.enabled,
      earnRate: config.earnRate,
      redeemEnabled: config.redeemEnabled,
      redeemRate: config.redeemRate,
      redeemMinPoints: config.redeemMinPoints,
      redeemMaxPercent: config.redeemMaxPercent,
      redeemStep: config.redeemStep,
      tierWindowDays: config.tierWindowDays,
    },
  };
}

/** Paged ledger for one customer, newest first. */
async function getHistory(userId, { type = "", from = "", to = "" } = {}, { page = 1, limit = 20 } = {}) {
  const filter = { user: toObjectId(userId) };
  if (type && MOVEMENT_TYPES.includes(type)) filter.type = type;

  const createdAt = {};
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) createdAt.$gte = parsed;
  }
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) createdAt.$lte = parsed;
  }
  if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    LoyaltyLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    LoyaltyLedger.countDocuments(filter),
  ]);

  return {
    entries: entries.map((entry) => ({
      id: entry._id,
      _id: entry._id,
      type: entry.type,
      points: entry.points,
      balanceAfter: entry.balanceAfter,
      reason: entry.reason,
      refType: entry.refType,
      refId: entry.refId,
      refCode: entry.refCode,
      earnBasis: entry.earnBasis || null,
      performedBy: entry.performedBy || null,
      createdAt: entry.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/**
 * What the checkout screen may offer. Advisory only: redeemForOrder revalidates
 * with the same rules, and the server is the one that decides.
 */
async function previewRedeem({ userId, subtotal = 0, discountAmount = 0 }) {
  const config = await getConfig();
  const user = await User.findById(userId).select("loyalty.pointsBalance").lean();
  const balance = Number(user?.loyalty?.pointsBalance) || 0;
  const eligibleAmount = Math.max(
    0,
    (Number(subtotal) || 0) - (Number(discountAmount) || 0)
  );

  const maxPoints = computeMaxRedeemablePoints({
    balance,
    eligibleAmount,
    config,
  });

  return {
    enabled: Boolean(config.enabled && config.redeemEnabled),
    balance,
    rate: config.redeemRate,
    step: config.redeemStep,
    minPoints: config.redeemMinPoints,
    maxPercent: config.redeemMaxPercent,
    maxPoints,
    maxDiscount: maxPoints * config.redeemRate,
  };
}

// ──────────────────────────────────────────────────────────────
// Admin operations
// ──────────────────────────────────────────────────────────────

/**
 * Hand-adjust one customer's balance.
 *
 * Deliberately the only write that takes an arbitrary number, and deliberately
 * the one that demands a reason: this is issuing value to a named person, which
 * is why it sits behind its own permission and lands in the audit log.
 *
 * No uniqueKey — an admin may legitimately adjust the same customer twice — so
 * it runs in its own transaction.
 */
async function adjustPoints({ userId, points, reason, performedBy }) {
  const delta = Number(points);
  if (!Number.isInteger(delta) || delta === 0) {
    throw new LoyaltyError(
      "Số điểm điều chỉnh phải là số nguyên khác 0",
      "INVALID_POINTS"
    );
  }
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    throw new LoyaltyError("Vui lòng nhập lý do điều chỉnh", "REASON_REQUIRED");
  }

  return runInTransaction(async (session) => {
    const { user, ledger } = await applyPointsMovement(
      {
        userId,
        type: "ADJUST",
        points: delta,
        refType: "User",
        refId: toObjectId(userId),
        reason: trimmedReason,
        performedBy,
      },
      session
    );
    return { ledger, balance: user.loyalty.pointsBalance, user };
  });
}

/** Paged view of every customer's loyalty standing, for the admin table. */
async function listMembers({ search = "", tierKey = "", page = 1, limit = 20 }) {
  const filter = {};
  if (tierKey) filter["loyalty.tierKey"] = tierKey;
  if (search) {
    const safe = String(search).trim().slice(0, 100);
    if (safe) {
      const pattern = new RegExp(
        safe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      filter.$or = [{ name: pattern }, { email: pattern }];
    }
  }

  const skip = (page - 1) * limit;
  const [users, total, config] = await Promise.all([
    User.find(filter)
      .select("name email avatar status loyalty createdAt")
      .sort({ "loyalty.pointsBalance": -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    getConfig(),
  ]);

  return {
    members: users.map((user) => {
      const loyalty = user.loyalty || {};
      const tier = resolveTierByKey(loyalty.tierKey, config);
      return {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
        status: user.status,
        pointsBalance: Number(loyalty.pointsBalance) || 0,
        pointsDebt: Number(loyalty.pointsDebt) || 0,
        lifetimeEarned: Number(loyalty.lifetimeEarned) || 0,
        lifetimeRedeemed: Number(loyalty.lifetimeRedeemed) || 0,
        spend12m: Number(loyalty.spend12m) || 0,
        tierKey: loyalty.tierKey || "",
        tierLabel: tier?.label || "",
        tierEvaluatedAt: loyalty.tierEvaluatedAt || null,
        tierValidUntil: loyalty.tierValidUntil || null,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/** One customer's standing plus their recent movements, for the detail page. */
async function getMemberDetail(userId, { page = 1, limit = 20 } = {}) {
  const [user, config, history] = await Promise.all([
    User.findById(userId).select("name email avatar status loyalty").lean(),
    getConfig(),
    getHistory(userId, {}, { page, limit }),
  ]);
  if (!user) {
    throw new LoyaltyError("Không tìm thấy người dùng", "USER_NOT_FOUND", 404);
  }

  const loyalty = user.loyalty || {};
  const tier = resolveTierByKey(loyalty.tierKey, config);

  // The admin view names who made each manual adjustment: an audit trail that
  // cannot answer "who" is not much of one.
  const performerIds = history.entries
    .map((entry) => entry.performedBy)
    .filter(Boolean);
  const performers = performerIds.length
    ? await User.find({ _id: { $in: performerIds } }).select("name email").lean()
    : [];
  const performerById = new Map(performers.map((row) => [String(row._id), row]));

  return {
    user: {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || "",
      status: user.status,
    },
    loyalty: {
      pointsBalance: Number(loyalty.pointsBalance) || 0,
      pointsDebt: Number(loyalty.pointsDebt) || 0,
      lifetimeEarned: Number(loyalty.lifetimeEarned) || 0,
      lifetimeRedeemed: Number(loyalty.lifetimeRedeemed) || 0,
      spend12m: Number(loyalty.spend12m) || 0,
      tierKey: loyalty.tierKey || "",
      tierLabel: tier?.label || "",
      tierEvaluatedAt: loyalty.tierEvaluatedAt || null,
      tierValidUntil: loyalty.tierValidUntil || null,
    },
    history: {
      ...history,
      entries: history.entries.map((entry) => ({
        ...entry,
        performedByName: entry.performedBy
          ? performerById.get(String(entry.performedBy))?.name || "—"
          : "Hệ thống",
      })),
    },
  };
}

/** Programme-level figures for the admin dashboard. */
async function getStats() {
  const [byType, tierRows, outstanding, debt] = await Promise.all([
    LoyaltyLedger.aggregate([
      { $group: { _id: "$type", points: { $sum: "$points" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([
      { $match: { "loyalty.pointsBalance": { $gt: 0 } } },
      {
        $group: {
          _id: { $ifNull: ["$loyalty.tierKey", ""] },
          members: { $sum: 1 },
          points: { $sum: "$loyalty.pointsBalance" },
        },
      },
    ]),
    User.aggregate([
      {
        $group: {
          _id: null,
          points: { $sum: { $ifNull: ["$loyalty.pointsBalance", 0] } },
        },
      },
    ]),
    User.aggregate([
      {
        $group: {
          _id: null,
          points: { $sum: { $ifNull: ["$loyalty.pointsDebt", 0] } },
          customers: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$loyalty.pointsDebt", 0] }, 0] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const config = await getConfig();
  return {
    // What the programme still owes customers, in points and in money.
    outstandingPoints: outstanding[0]?.points || 0,
    outstandingValue: (outstanding[0]?.points || 0) * config.redeemRate,
    pointsDebt: debt[0]?.points || 0,
    customersWithDebt: debt[0]?.customers || 0,
    byType: byType.map((row) => ({
      type: row._id,
      points: row.points,
      count: row.count,
    })),
    tierDistribution: (config.tiers || []).map((tier) => {
      const row = tierRows.find((entry) => entry._id === tier.key);
      return {
        key: tier.key,
        label: tier.label,
        members: row?.members || 0,
        points: row?.points || 0,
      };
    }),
  };
}

// ──────────────────────────────────────────────────────────────
// Reconciliation
// ──────────────────────────────────────────────────────────────

/**
 * Customers whose cached balance disagrees with the sum of their ledger.
 *
 * Mirrors inventoryService.reconcileStock: it reports drift and never repairs
 * it. A non-zero drift means something wrote to pointsBalance without going
 * through applyPointsMovement, which is a bug a person needs to look at.
 */
async function reconcileBalances({ limit = 100 } = {}) {
  return LoyaltyLedger.aggregate([
    { $group: { _id: "$user", ledgerTotal: { $sum: "$points" } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        name: "$user.name",
        email: "$user.email",
        balance: { $ifNull: ["$user.loyalty.pointsBalance", 0] },
        ledgerTotal: 1,
        drift: {
          $subtract: [
            { $ifNull: ["$user.loyalty.pointsBalance", 0] },
            "$ledgerTotal",
          ],
        },
      },
    },
    { $match: { drift: { $ne: 0 } } },
    { $sort: { drift: -1 } },
    { $limit: Math.max(1, Number(limit) || 100) },
  ]);
}

module.exports = {
  LoyaltyError,
  applyPointsMovement,
  applyDebtMovement,
  getConfig,
  reconcileBalances,
  // Order integration
  earnForOrder,
  redeemForOrder,
  refundOrderPoints,
  refundOrderPointsPartial,
  revokeOrderPoints,
  revokeOrderPointsPartial,
  // Customer-facing reads
  getSummary,
  getHistory,
  previewRedeem,
  // Tier evaluation
  recalcTier,
  computeSpendWindow,
  computeSpendWindowBatch,
  // Gift catalogue
  redeemGift,
  listGifts,
  listMyRedemptions,
  // Admin
  adjustPoints,
  listMembers,
  getMemberDetail,
  getStats,
  // Pure helpers
  eligibleAmountForOrder,
  computeEarnPoints,
  computeMaxRedeemablePoints,
  resolveTier,
  resolveTierByKey,
};
