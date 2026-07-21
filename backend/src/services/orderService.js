const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const { generateOrderCode } = require("../models/Order");
const Book = require("../models/Book");
const Promotion = require("../models/Promotion");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const Cart = require("../models/Cart");
const User = require("../models/User");
const OrderOutboxEvent = require("../models/OrderOutboxEvent");
const config = require("../config");
const paymentGateway = require("./paymentGateway");
const notificationService = require("./notificationService");
const loyaltyService = require("./loyaltyService");
const { validateOrderInput } = require("../utils/orderValidation");
const {
  applyVoucher,
  consumeVoucher,
  releaseOrderVoucher,
} = require("./voucherReservationService");
const { runInTransaction } = require("../utils/transaction");
const {
  decrementSold,
  decrementStock,
  dispatchItems,
  incrementSold,
  restoreItems,
} = require("./orderInventoryService");

const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  PAYMENT_ATTEMPT_STATUS,
  DUPLICATE_REFUND_STATUS,
} = Order;

const PENDING_TTL_MS = config.orders.onlinePendingTtlMs;
const COD_PENDING_TTL_MS = config.orders.codPendingTtlMs;
const MAX_PENDING_COD_PER_USER = config.orders.maxPendingCodPerUser;
const MAX_PENDING_ONLINE_PER_USER = config.orders.maxPendingOnlinePerUser;
const MAX_PAYMENT_ATTEMPTS_PER_ORDER =
  config.orders.maxPaymentAttemptsPerOrder;
const PAYMENT_RETRY_COOLDOWN_MS = config.orders.paymentRetryCooldownMs;
const REFUND_RETRY_LOCK_MS = 60 * 1000;
const REFUND_RETRY_BASE_MS = 60 * 1000;
const REFUND_RETRY_MAX_MS = 60 * 60 * 1000;
const INTERNAL_ORDER_FIELDS = [
  "+inventoryRestoredAt",
  "+voucherReleasedAt",
  "+pointsEarnedAt",
  "+pointsRefundedAt",
  "+pointsRevokedAt",
  "+voucher.voucherId",
  "+shippingVoucher.voucherId",
  "+payment.attempts",
  "+payment.refundIdempotencyKey",
  "+payment.refundReason",
  "+payment.refundInitiatedBy",
  "+payment.refundClientIp",
  "+payment.refundRequestedAt",
  "+payment.refundNextRetryAt",
  "+payment.refundRetryCount",
  "+payment.refundRetryLockUntil",
  "+payment.refundRetryLockToken",
  "+payment.refundLastError",
  "+payment.rawPayload",
  "+payment.refundRawPayload",
].join(" ");

function normalizeForHash(value) {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = normalizeForHash(value[key]);
        }
        return result;
      }, {});
  }
  return value;
}

function hashOrderRequest(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizeForHash(payload)))
    .digest("hex");
}

function validateIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (key.length < 8 || key.length > 128) {
    const error = new Error("Idempotency-Key phải có từ 8 đến 128 ký tự");
    error.code = "INVALID_IDEMPOTENCY_KEY";
    throw error;
  }
  return key;
}

function assertMatchingIdempotencyRequest(order, requestHash) {
  if (order.idempotencyHash && order.idempotencyHash !== requestHash) {
    const error = new Error(
      "Idempotency-Key đã được sử dụng cho một nội dung đơn hàng khác"
    );
    error.code = "IDEMPOTENCY_CONFLICT";
    throw error;
  }
}

function findOrderByIdempotency(userId, idempotencyKey, session = null) {
  const query = Order.findOne({ user: userId, idempotencyKey }).select(
    "+idempotencyKey +idempotencyHash +payment.checkoutUrl"
  );
  if (session) query.session(session);
  return query;
}

function notifyUserSafe(...args) {
  return notificationService.notifyUser(...args).catch(() => null);
}

function activePendingCodFilter(userId, now = new Date()) {
  const legacyCutoff = new Date(now.getTime() - COD_PENDING_TTL_MS);
  return {
    user: userId,
    status: ORDER_STATUS.PENDING,
    "payment.method": PAYMENT_METHOD.COD,
    "payment.status": PAYMENT_STATUS.UNPAID,
    $or: [
      { expiresAt: { $gt: now } },
      { expiresAt: null, placedAt: { $gt: legacyCutoff } },
    ],
  };
}

function activePendingOnlineFilter(userId, now = new Date()) {
  const legacyCutoff = new Date(now.getTime() - PENDING_TTL_MS);
  return {
    user: userId,
    status: ORDER_STATUS.PENDING,
    "payment.method": { $ne: PAYMENT_METHOD.COD },
    "payment.status": PAYMENT_STATUS.UNPAID,
    $or: [
      { expiresAt: { $gt: now } },
      { expiresAt: null, placedAt: { $gt: legacyCutoff } },
    ],
  };
}

function expiredPendingFilter(now = new Date()) {
  const legacyCodCutoff = new Date(now.getTime() - COD_PENDING_TTL_MS);
  return {
    status: ORDER_STATUS.PENDING,
    "payment.status": PAYMENT_STATUS.UNPAID,
    $or: [
      { expiresAt: { $lte: now } },
      {
        "payment.method": PAYMENT_METHOD.COD,
        expiresAt: null,
        placedAt: { $lte: legacyCodCutoff },
      },
    ],
  };
}

function normalizePaymentMethod(method) {
  if (!method) return PAYMENT_METHOD.COD;
  const upper = String(method).toUpperCase();
  const aliases = {
    BANKING: PAYMENT_METHOD.VNPAY,
    ATM: PAYMENT_METHOD.VNPAY,
    MOMO: PAYMENT_METHOD.MOMO,
    WALLET: PAYMENT_METHOD.MOMO,
  };
  const normalized = aliases[upper] || upper;
  const allowed = Object.values(PAYMENT_METHOD);
  if (!allowed.includes(normalized)) {
    throw new Error(`Phương thức thanh toán không hợp lệ: ${method}`);
  }
  return normalized;
}

function legacyAttemptStatus(order) {
  if (
    [
      PAYMENT_STATUS.PAID,
      PAYMENT_STATUS.REFUNDING,
      PAYMENT_STATUS.REFUNDED,
    ].includes(order.payment?.status)
  ) {
    return PAYMENT_ATTEMPT_STATUS.SUCCEEDED;
  }
  if (order.payment?.status === PAYMENT_STATUS.FAILED) {
    return PAYMENT_ATTEMPT_STATUS.FAILED;
  }
  return PAYMENT_ATTEMPT_STATUS.PENDING;
}

function findPaymentAttempt(order, providerOrderId) {
  const normalizedProviderOrderId = String(providerOrderId || "");
  if (!normalizedProviderOrderId) return null;
  const storedAttempt = order.payment?.attempts?.find(
    (attempt) =>
      String(attempt.providerOrderId || "") === normalizedProviderOrderId
  );
  if (storedAttempt) return storedAttempt;

  // Backward compatibility for orders created before payment-attempt history
  // was introduced. The legacy snapshot is materialized on the next callback
  // or retry so its reference is never lost.
  const legacyProviderOrderId =
    order.payment?.providerOrderId || order.payment?.transactionId;
  if (String(legacyProviderOrderId || "") !== normalizedProviderOrderId) {
    return null;
  }
  return {
    providerOrderId: normalizedProviderOrderId,
    method: order.payment.method,
    amount: order.totalAmount,
    status: legacyAttemptStatus(order),
    gatewayTransactionId:
      order.payment.transactionId === normalizedProviderOrderId
        ? ""
        : order.payment.transactionId,
    createdAt: order.payment.providerCreatedAt || order.placedAt,
    completedAt: order.payment.paidAt || null,
    legacy: true,
  };
}

function ensureStoredPaymentAttempt(order, matchedAttempt) {
  if (!matchedAttempt?.legacy) return matchedAttempt;
  order.payment.attempts.push({
    providerOrderId: matchedAttempt.providerOrderId,
    method: matchedAttempt.method,
    amount: matchedAttempt.amount,
    status: matchedAttempt.status,
    gatewayTransactionId: matchedAttempt.gatewayTransactionId || "",
    createdAt: matchedAttempt.createdAt,
    completedAt: matchedAttempt.completedAt,
  });
  return order.payment.attempts.at(-1);
}

function markPaymentAttemptSucceeded(attempt, transactionId, rawPayload) {
  attempt.status = PAYMENT_ATTEMPT_STATUS.SUCCEEDED;
  attempt.gatewayTransactionId = String(transactionId || "");
  attempt.failureReason = "";
  attempt.rawPayload = rawPayload || null;
  attempt.completedAt = attempt.completedAt || new Date();
}

function markPaymentAttemptFailed(attempt, reason, rawPayload) {
  if (attempt.status === PAYMENT_ATTEMPT_STATUS.SUCCEEDED) return false;
  attempt.status = PAYMENT_ATTEMPT_STATUS.FAILED;
  attempt.failureReason = String(reason || "Payment failed").slice(0, 500);
  attempt.rawPayload = rawPayload || null;
  attempt.completedAt = attempt.completedAt || new Date();
  return true;
}

function prepareDuplicatePaymentRefund(order, attempt) {
  if (!attempt.duplicateRefund) attempt.duplicateRefund = {};
  const refund = attempt.duplicateRefund;
  if (refund.status === DUPLICATE_REFUND_STATUS.REFUNDED) return false;

  const now = new Date();
  const referenceHash = crypto
    .createHash("sha256")
    .update(String(attempt.providerOrderId))
    .digest("hex")
    .slice(0, 24);
  refund.status = DUPLICATE_REFUND_STATUS.PENDING;
  refund.idempotencyKey =
    refund.idempotencyKey ||
    `duplicate-refund:${order.orderCode}:${referenceHash}`;
  refund.requestedAt = refund.requestedAt || now;
  refund.nextRetryAt = refund.nextRetryAt || now;
  refund.retryCount = Number(refund.retryCount) || 0;
  return true;
}

function assertPaymentCallback(order, { method, providerOrderId, amount }) {
  const callbackMethod = normalizePaymentMethod(method);
  const normalizedAmount = Number(amount);

  if (callbackMethod !== order.payment.method) {
    throw new Error("Payment callback method does not match the order");
  }
  const attempt = findPaymentAttempt(order, providerOrderId);
  if (!attempt || attempt.method !== callbackMethod) {
    throw new Error("Payment callback reference does not match the order");
  }
  if (
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount !== Number(attempt.amount ?? order.totalAmount)
  ) {
    throw new Error("Payment callback amount does not match the order");
  }
  return attempt;
}

async function completeRefund(order, session, rawPayload) {
  // Refund settlement is a money event, not proof that a dispatched parcel
  // came back. Before dispatch we can release the order's reservation here;
  // after SHIP_OUT, only an explicit return-received workflow may post
  // RETURN_IN. This also prevents a lost parcel from creating virtual stock.
  const wasDispatched = Boolean(
    order.shippedAt ||
      order.history?.some((entry) => entry.to === ORDER_STATUS.SHIPPED)
  );
  if (!order.inventoryRestoredAt && !wasDispatched) {
    await restoreItems(
      order.items,
      session,
      { orderId: order._id, orderCode: order.orderCode, reason: "Hoàn tiền đơn hàng" },
      "RESERVE_IN"
    );
    order.inventoryRestoredAt = new Date();
  }
  if (order.deliveredAt) {
    for (const item of order.items) {
      await decrementSold(item.book, item.quantity, session);
    }
    // The order was delivered, so points were granted for it. Claw back what
    // is still there; revokeOrderPoints records any shortfall rather than
    // pushing the balance negative.
    await loyaltyService.revokeOrderPoints(order, session, {
      reason: `Thu hồi điểm đơn ${order.orderCode} do hoàn tiền`,
    });
  }
  order.applyTransition(ORDER_STATUS.REFUNDED, {
    by: "gateway",
    reason: "Refund succeeded",
  });
  await releaseOrderVoucher(order, session);
  await loyaltyService.refundOrderPoints(order, session, {
    reason: `Hoàn điểm đơn ${order.orderCode} do hoàn tiền`,
  });
  order.payment.refundRawPayload = rawPayload || order.payment.refundRawPayload;
}

/**
 * Close a full refund for a parcel confirmed lost after dispatch.
 *
 * Support owns the gateway transaction and its identity, but the Order still
 * owns lifecycle, voucher and redeemed-points side effects. Keeping this in
 * the order service prevents a settled support ticket from leaving the order
 * indefinitely SHIPPED/REFUNDING.
 */
async function completeLostInTransitRefund(orderId, session, rawPayload = null) {
  const order = await Order.findById(orderId)
    .select(INTERNAL_ORDER_FIELDS)
    .session(session || null);
  if (!order) throw new Error(`Order ${orderId} không tồn tại`);
  if (order.status === ORDER_STATUS.REFUNDED) return order;
  if (order.status === ORDER_STATUS.SHIPPED) {
    order.applyTransition(ORDER_STATUS.REFUNDING, {
      by: "support",
      reason: "Lost in transit refund settled",
    });
  }
  if (order.status !== ORDER_STATUS.REFUNDING) {
    throw new Error(
      `Order ${order.orderCode} không thể hoàn tất hoàn tiền thất lạc từ trạng thái ${order.status}`
    );
  }
  await completeRefund(order, session, rawPayload);
  await order.save(session ? { session } : undefined);
  return order;
}

function prepareRefundRequest(
  order,
  {
    idempotencyKey,
    reason,
    initiatedBy,
    clientIp = "",
    transitionBy,
    transitionReason,
  }
) {
  if (!idempotencyKey) {
    throw new Error("Refund idempotency key is required");
  }
  if (order.status !== ORDER_STATUS.REFUNDING) {
    order.applyTransition(ORDER_STATUS.REFUNDING, {
      by: transitionBy || initiatedBy || "system",
      reason: transitionReason || reason || "Refund requested",
    });
  }

  const now = new Date();
  order.payment.refundIdempotencyKey =
    order.payment.refundIdempotencyKey || String(idempotencyKey);
  order.payment.refundBusinessType = "ORDER";
  order.payment.refundSourceId = String(order._id);
  order.payment.refundAmount = Math.max(
    0,
    Math.round(Number(order.totalAmount) || 0)
  );
  order.payment.refundOriginalPaymentTransactionId = String(
    order.payment.transactionId || ""
  );
  order.payment.refundOriginalProviderOrderId = String(
    order.payment.providerOrderId || ""
  );
  order.payment.refundReason = String(reason || "Refund order").slice(0, 500);
  order.payment.refundInitiatedBy = String(initiatedBy || "system").slice(
    0,
    150
  );
  order.payment.refundClientIp = String(clientIp || "").slice(0, 100);
  order.payment.refundRequestedAt = order.payment.refundRequestedAt || now;
  order.payment.refundNextRetryAt = now;
  order.payment.refundRetryCount = Number(order.payment.refundRetryCount) || 0;
  order.payment.refundRetryLockUntil = null;
  order.payment.refundRetryLockToken = "";
  order.payment.refundLastError = "";
}

function refundRetryDelay(attemptCount) {
  const exponent = Math.max(0, Math.min(Number(attemptCount) - 1, 10));
  return Math.min(REFUND_RETRY_BASE_MS * 2 ** exponent, REFUND_RETRY_MAX_MS);
}

async function recordDuplicateRefundFailure(
  orderId,
  providerOrderId,
  lockToken,
  retryCount,
  error
) {
  const message = String(
    error?.message || error || "Duplicate payment refund failed"
  ).slice(0, 500);
  const nextRetryCount = (Number(retryCount) || 0) + 1;
  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        "payment.attempts.$[attempt].duplicateRefund.lastError": message,
        "payment.attempts.$[attempt].duplicateRefund.retryCount":
          nextRetryCount,
        "payment.attempts.$[attempt].duplicateRefund.nextRetryAt": new Date(
          Date.now() + refundRetryDelay(nextRetryCount)
        ),
        "payment.attempts.$[attempt].duplicateRefund.lockUntil": null,
        "payment.attempts.$[attempt].duplicateRefund.lockToken": "",
      },
    },
    {
      arrayFilters: [
        {
          "attempt.providerOrderId": String(providerOrderId),
          "attempt.duplicateRefund.status":
            DUPLICATE_REFUND_STATUS.PENDING,
          "attempt.duplicateRefund.lockToken": lockToken,
        },
      ],
    }
  );
  return {
    order: await Order.findById(orderId),
    attempted: true,
    completed: false,
    error: message,
  };
}

async function executeDuplicatePaymentRefund(orderId, providerOrderId) {
  const now = new Date();
  const normalizedReference = String(providerOrderId || "");
  const lockToken = crypto.randomUUID();
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      "payment.attempts": {
        $elemMatch: {
          providerOrderId: normalizedReference,
          status: PAYMENT_ATTEMPT_STATUS.SUCCEEDED,
          "duplicateRefund.status": DUPLICATE_REFUND_STATUS.PENDING,
          $and: [
            {
              $or: [
                { "duplicateRefund.lockUntil": null },
                { "duplicateRefund.lockUntil": { $lte: now } },
              ],
            },
            {
              $or: [
                { "duplicateRefund.nextRetryAt": null },
                { "duplicateRefund.nextRetryAt": { $lte: now } },
              ],
            },
          ],
        },
      },
    },
    {
      $set: {
        "payment.attempts.$[attempt].duplicateRefund.lockToken": lockToken,
        "payment.attempts.$[attempt].duplicateRefund.lockUntil": new Date(
          now.getTime() + REFUND_RETRY_LOCK_MS
        ),
      },
    },
    {
      arrayFilters: [
        {
          "attempt.providerOrderId": normalizedReference,
          "attempt.duplicateRefund.status":
            DUPLICATE_REFUND_STATUS.PENDING,
        },
      ],
      returnDocument: "after",
    }
  ).select(INTERNAL_ORDER_FIELDS);

  if (!claimed) {
    return {
      order: await Order.findById(orderId),
      attempted: false,
      completed: false,
    };
  }

  const attempt = claimed.payment.attempts.find(
    (item) => String(item.providerOrderId) === normalizedReference
  );
  if (!attempt) {
    return recordDuplicateRefundFailure(
      orderId,
      normalizedReference,
      lockToken,
      0,
      new Error("Duplicate payment attempt is missing")
    );
  }

  let gatewayResult;
  try {
    gatewayResult = await paymentGateway.requestRefund({
      method: attempt.method,
      providerOrderId: attempt.providerOrderId,
      transactionId: attempt.gatewayTransactionId,
      providerCreatedAt: attempt.createdAt || claimed.placedAt,
      amount: attempt.amount,
      originalAmount: attempt.amount,
      reason: `Duplicate payment for order ${claimed.orderCode}`,
      idempotencyKey: attempt.duplicateRefund.idempotencyKey,
      clientIp: "",
      initiatedBy: "system",
    });
  } catch (error) {
    return recordDuplicateRefundFailure(
      orderId,
      normalizedReference,
      lockToken,
      attempt.duplicateRefund.retryCount,
      error
    );
  }

  if (!gatewayResult.ok) {
    return recordDuplicateRefundFailure(
      orderId,
      normalizedReference,
      lockToken,
      attempt.duplicateRefund.retryCount,
      gatewayResult.error || "Duplicate payment refund was rejected"
    );
  }

  const completed = Boolean(gatewayResult.completed);
  const update = {
    "payment.attempts.$[attempt].duplicateRefund.status": completed
      ? DUPLICATE_REFUND_STATUS.REFUNDED
      : DUPLICATE_REFUND_STATUS.PENDING,
    "payment.attempts.$[attempt].duplicateRefund.refundTransactionId":
      String(gatewayResult.refundTransactionId || ""),
    "payment.attempts.$[attempt].duplicateRefund.rawPayload":
      gatewayResult.rawPayload || gatewayResult,
    "payment.attempts.$[attempt].duplicateRefund.lastError": "",
    "payment.attempts.$[attempt].duplicateRefund.lockUntil": null,
    "payment.attempts.$[attempt].duplicateRefund.lockToken": "",
    "payment.attempts.$[attempt].duplicateRefund.nextRetryAt": completed
      ? null
      : new Date(Date.now() + REFUND_RETRY_BASE_MS),
    "payment.attempts.$[attempt].duplicateRefund.refundedAt": completed
      ? new Date()
      : null,
  };
  const updated = await Order.findOneAndUpdate(
    { _id: orderId },
    { $set: update },
    {
      arrayFilters: [
        {
          "attempt.providerOrderId": normalizedReference,
          "attempt.duplicateRefund.status":
            DUPLICATE_REFUND_STATUS.PENDING,
          "attempt.duplicateRefund.lockToken": lockToken,
        },
      ],
      returnDocument: "after",
    }
  );
  if (!updated) {
    return recordDuplicateRefundFailure(
      orderId,
      normalizedReference,
      lockToken,
      attempt.duplicateRefund.retryCount,
      new Error("Order changed while recording duplicate payment refund")
    );
  }
  return { order: updated, attempted: true, completed };
}

async function recordRefundAttemptFailure(claimed, lockToken, error) {
  const message = String(error?.message || error || "Refund gateway request failed").slice(
    0,
    500
  );
  const retryCount = (Number(claimed.payment.refundRetryCount) || 0) + 1;
  await Order.updateOne(
    {
      _id: claimed._id,
      status: ORDER_STATUS.REFUNDING,
      "payment.refundRetryLockToken": lockToken,
    },
    {
      $set: {
        "payment.refundLastError": message,
        "payment.refundRetryCount": retryCount,
        "payment.refundNextRetryAt": new Date(
          Date.now() + refundRetryDelay(retryCount)
        ),
        "payment.refundRetryLockUntil": null,
        "payment.refundRetryLockToken": "",
      },
    }
  );
  const order = await Order.findById(claimed._id);
  return {
    order,
    attempted: true,
    accepted: false,
    completed: false,
    error: message,
  };
}

async function executePendingRefund(orderId) {
  const now = new Date();
  const lockToken = crypto.randomUUID();
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: ORDER_STATUS.REFUNDING,
      "payment.status": PAYMENT_STATUS.REFUNDING,
      "payment.refundTransactionId": { $in: ["", null] },
      "payment.refundIdempotencyKey": { $nin: ["", null] },
      $and: [
        {
          $or: [
            { "payment.refundRetryLockUntil": null },
            { "payment.refundRetryLockUntil": { $lte: now } },
          ],
        },
        {
          $or: [
            { "payment.refundNextRetryAt": null },
            { "payment.refundNextRetryAt": { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        "payment.refundRetryLockToken": lockToken,
        "payment.refundRetryLockUntil": new Date(
          now.getTime() + REFUND_RETRY_LOCK_MS
        ),
      },
    },
    { returnDocument: "after" }
  ).select(INTERNAL_ORDER_FIELDS);

  if (!claimed) {
    return {
      order: await Order.findById(orderId),
      attempted: false,
      accepted: false,
      completed: false,
    };
  }

  let gatewayResult;
  try {
    gatewayResult = await paymentGateway.requestRefund({
      method: claimed.payment.method,
      providerOrderId:
        claimed.payment.providerOrderId || claimed.payment.transactionId,
      transactionId: claimed.payment.transactionId,
      providerCreatedAt:
        claimed.payment.providerCreatedAt || claimed.placedAt,
      amount: claimed.totalAmount,
      originalAmount: claimed.totalAmount,
      reason: claimed.payment.refundReason,
      idempotencyKey: claimed.payment.refundIdempotencyKey,
      clientIp: claimed.payment.refundClientIp,
      initiatedBy: claimed.payment.refundInitiatedBy,
    });
  } catch (error) {
    return recordRefundAttemptFailure(claimed, lockToken, error);
  }

  if (
    !gatewayResult.ok ||
    !String(gatewayResult.refundTransactionId || "").trim()
  ) {
    return recordRefundAttemptFailure(
      claimed,
      lockToken,
      gatewayResult.error ||
        "Refund gateway did not return a refund transaction id"
    );
  }

  try {
    const order = await runInTransaction(async (session) => {
      const current = await Order.findOne({
        _id: claimed._id,
        status: ORDER_STATUS.REFUNDING,
        "payment.refundRetryLockToken": lockToken,
      })
        .select(INTERNAL_ORDER_FIELDS)
        .session(session);
      if (!current) return null;

      current.payment.refundTransactionId = gatewayResult.refundTransactionId;
      current.payment.refundRawPayload = gatewayResult.rawPayload || null;
      current.payment.refundLastError = "";
      current.payment.refundNextRetryAt = null;
      current.payment.refundRetryLockUntil = null;
      current.payment.refundRetryLockToken = "";
      if (gatewayResult.completed) {
        await completeRefund(current, session, gatewayResult.rawPayload);
      }
      await current.save({ session });
      return current;
    });

    return {
      order: order || (await Order.findById(orderId)),
      attempted: true,
      accepted: true,
      completed: Boolean(gatewayResult.completed),
    };
  } catch (error) {
    return recordRefundAttemptFailure(claimed, lockToken, error);
  }
}

async function removePurchasedItemsFromCart(userId, items, session) {
  const cart = await Cart.findOne({ user: userId }).session(session);
  if (!cart) return;
  const purchased = new Map(
    items.map((item) => [String(item.book), Number(item.quantity) || 0])
  );
  cart.items = cart.items.flatMap((item) => {
    const remaining = item.quantity - (purchased.get(String(item.book)) || 0);
    return remaining > 0 ? [{ ...item.toObject(), quantity: remaining }] : [];
  });
  await cart.save({ session });
}

// ──────────────────────────────────────────────────────────────
// Create order
//   - Trừ stock atomic cho từng item. Nếu fail → rollback các item đã trừ.
//   - Tạo order PENDING với TTL theo phương thức thanh toán.
// ──────────────────────────────────────────────────────────────
async function finishOrderCreation(
  result,
  { userId, clientIp, frontendUrl }
) {
  const { order, replayed } = result;
  const hasUsableCheckout =
    order.payment?.checkoutUrl &&
    order.expiresAt &&
    order.expiresAt > new Date();
  const needsCheckout =
    order.status === ORDER_STATUS.PENDING &&
    order.payment?.status === PAYMENT_STATUS.UNPAID &&
    order.payment?.method !== PAYMENT_METHOD.COD &&
    !hasUsableCheckout;

  if (!needsCheckout) {
    return {
      order,
      paymentUrl: order.payment?.checkoutUrl || null,
      replayed,
    };
  }

  const paymentResult = await retryPayment({
    orderId: order._id,
    userId,
    clientIp,
    frontendUrl,
  });
  return { ...paymentResult, replayed };
}

async function createOrder({
  userId,
  items,
  shippingAddress,
  paymentMethod = PAYMENT_METHOD.COD,
  voucherCode,
  orderVoucherCode,
  shippingVoucherCode,
  shippingMethod,
  shippingFee = 0,
  authoritativeShipping = null,
  note = "",
  pointsToRedeem = 0,
  clientIp,
  frontendUrl,
  idempotencyKey,
  checkoutSource = "CART",
  expectedTotal = null,
}) {
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const input = validateOrderInput({
    items,
    shippingAddress,
    paymentMethod: normalizedPaymentMethod,
    voucherCode,
    orderVoucherCode,
    shippingVoucherCode,
    shippingMethod,
    legacyShippingFee: shippingFee,
    note,
    pointsToRedeem,
    checkoutSource,
    expectedTotal,
  });
  if (authoritativeShipping) {
    const fee = Number(authoritativeShipping.fee);
    if (!Number.isInteger(fee) || fee < 0 || fee > 10_000_000) {
      throw new Error("Phí vận chuyển không hợp lệ");
    }
    input.shippingFee = fee;
    input.shippingMethod = ["standard", "express"].includes(
      authoritativeShipping.method
    )
      ? authoritativeShipping.method
      : "standard";
    const snapshot = authoritativeShipping.snapshot || {};
    input.shipment = {
      provider: snapshot.provider === "ghn" ? "ghn" : "manual",
      environment: snapshot.provider === "ghn" ? "sandbox" : "",
      quoteId: String(snapshot.quoteId || "").slice(0, 100),
      serviceId: Number(snapshot.serviceId) || null,
      serviceTypeId: Number(snapshot.serviceTypeId) || null,
      serviceName: String(snapshot.serviceName || "").slice(0, 100),
      quotedFee: fee,
      quotedAt: snapshot.quotedAt || new Date(),
      estimatedDelivery: snapshot.estimatedDelivery || null,
    };
  }
  const normalizedIdempotencyKey = validateIdempotencyKey(idempotencyKey);
  const requestHash = hashOrderRequest(input);

  const existing = await findOrderByIdempotency(
    userId,
    normalizedIdempotencyKey
  );
  if (existing) {
    assertMatchingIdempotencyRequest(existing, requestHash);
    return finishOrderCreation(
      { order: existing, replayed: true },
      { userId, clientIp, frontendUrl }
    );
  }

  let creationResult;
  try {
    creationResult = await runInTransaction(async (session) => {
      const replay = await findOrderByIdempotency(
        userId,
        normalizedIdempotencyKey,
        session
      );
      if (replay) {
        assertMatchingIdempotencyRequest(replay, requestHash);
        return {
          order: replay,
          paymentUrl: replay.payment?.checkoutUrl || null,
          replayed: true,
        };
      }

      if (normalizedPaymentMethod === PAYMENT_METHOD.COD) {
        const customer = await User.findOneAndUpdate(
          { _id: userId, emailVerifiedAt: { $type: "date" } },
          { $set: { codReservationGuardAt: new Date() } },
          { returnDocument: "after", session }
        ).select("emailVerifiedAt");
        if (!customer?.emailVerifiedAt) {
          const error = new Error(
            "Vui lòng xác minh email trước khi đặt đơn COD"
          );
          error.code = "EMAIL_VERIFICATION_REQUIRED";
          error.statusCode = 403;
          throw error;
        }
        const pendingCodCount = await Order.countDocuments(
          activePendingCodFilter(userId)
        ).session(session);
        if (pendingCodCount >= MAX_PENDING_COD_PER_USER) {
          const error = new Error(
            `Bạn chỉ có thể có tối đa ${MAX_PENDING_COD_PER_USER} đơn COD đang chờ xử lý`
          );
          error.code = "PENDING_COD_LIMIT";
          error.statusCode = 409;
          throw error;
        }
      } else {
        await User.updateOne(
          { _id: userId },
          { $set: { onlineReservationGuardAt: new Date() } },
          { session }
        );
        const pendingOnlineCount = await Order.countDocuments(
          activePendingOnlineFilter(userId)
        ).session(session);
        if (pendingOnlineCount >= MAX_PENDING_ONLINE_PER_USER) {
          const error = new Error(
            `Bạn chỉ có thể có tối đa ${MAX_PENDING_ONLINE_PER_USER} đơn online đang chờ thanh toán`
          );
          error.code = "PENDING_ONLINE_LIMIT";
          error.statusCode = 409;
          throw error;
        }
      }

      // Mint the order identity before reserving inventory so every SALE_OUT
      // movement is traceable to its source even though the Order document is
      // persisted later in this same transaction.
      const orderId = new mongoose.Types.ObjectId();
      const orderCode = generateOrderCode();
      const bookIds = input.items.map((item) => item.bookId);
      const books = await Book.find({ _id: { $in: bookIds } }).session(session);
      const decoratedBooks = await Promotion.decorateBooks(books, { session });
      const bookMap = new Map(books.map((book) => [book._id.toString(), book]));
      const decoratedBookMap = new Map(
        decoratedBooks.map((book) => [String(book._id || book.id), book])
      );
      const orderItems = [];
      let subtotal = 0;

      for (const item of input.items) {
        const book = bookMap.get(String(item.bookId));
        if (!book) throw new Error(`Không tìm thấy sách: ${item.bookId}`);
        if (book.status !== "active") {
          throw new Error(`Sách "${book.title}" đã ngừng bán`);
        }

        const qty = item.quantity;

        const ok = await decrementStock(book._id, qty, session, {
          reason: "Bán hàng",
          orderId,
          orderCode,
        });
        if (!ok) throw new Error(`Không đủ hàng: ${book.title}`);

        const decoratedBook = decoratedBookMap.get(book._id.toString()) || book;
        const unitPrice = Number(decoratedBook.price) || 0;
        if (
          item.expectedUnitPrice !== null &&
          item.expectedUnitPrice !== undefined &&
          unitPrice !== item.expectedUnitPrice
        ) {
          const error = new Error(
            `Giá của “${book.title}” đã thay đổi từ ${item.expectedUnitPrice.toLocaleString("vi-VN")}đ thành ${unitPrice.toLocaleString("vi-VN")}đ. Vui lòng xác nhận lại đơn hàng.`
          );
          error.code = "PRICE_CHANGED";
          error.statusCode = 409;
          throw error;
        }
        const lineSubtotal = unitPrice * qty;
        subtotal += lineSubtotal;
        orderItems.push({
          book: book._id,
          title: book.title,
          author: book.author,
          imageUrl: book.imageUrl,
          category: book.category,
          price: unitPrice,
          // Read before decrementStock so it is the moving-average cost the
          // sale was actually made at, not one a later receipt shifted.
          costPrice: Number(book.costPrice) || 0,
          quantity: qty,
          subtotal: lineSubtotal,
          weight: Number(book.weight) > 0 ? book.weight : null,
          dimensions: {
            length: Number(book.dimensions?.length) > 0
              ? book.dimensions.length
              : null,
            width: Number(book.dimensions?.width) > 0
              ? book.dimensions.width
              : null,
            height: Number(book.dimensions?.height) > 0
              ? book.dimensions.height
              : null,
          },
        });
      }

      let orderVoucherResult = await applyVoucher(
        input.orderVoucherCode,
        subtotal,
        { session, userId, shippingFee: input.shippingFee }
      );
      let shippingVoucherResult = await applyVoucher(
        input.shippingVoucherCode,
        subtotal,
        { session, userId, shippingFee: input.shippingFee }
      );
      if (orderVoucherResult.voucher?.scope === "shipping") {
        throw new Error("Mã này là voucher giảm phí vận chuyển");
      }
      if (shippingVoucherResult.voucher?.scope !== "shipping" && shippingVoucherResult.voucher) {
        throw new Error("Mã này là voucher giảm giá đơn hàng");
      }

      // Backward compatibility for clients that still submit a single code.
      if (input.voucherCode && !input.orderVoucherCode && !input.shippingVoucherCode) {
        const legacyResult = await applyVoucher(input.voucherCode, subtotal, {
          session,
          userId,
          shippingFee: input.shippingFee,
        });
        if (legacyResult.voucher?.scope === "shipping") {
          shippingVoucherResult = legacyResult;
        } else {
          orderVoucherResult = legacyResult;
        }
      }

      const voucher = orderVoucherResult.voucher;
      const shippingVoucher = shippingVoucherResult.voucher;
      if (voucher) await consumeVoucher(voucher, userId, session);
      if (shippingVoucher) {
        await consumeVoucher(shippingVoucher, userId, session);
      }
      const orderDiscountAmount = orderVoucherResult.discountAmount;
      const shippingDiscountAmount = shippingVoucherResult.discountAmount;
      const discountAmount = orderDiscountAmount + shippingDiscountAmount;

      // Points are spent last, once the voucher discounts are known.
      //
      // Ordering matters: this runs after consumeVoucher and after stock has
      // been decremented, because points are the cheapest resource to roll back
      // and this keeps the write lock on the User document short.
      // The cap is defined against the goods total net of the order voucher —
      // shipping is excluded, and a shipping voucher must not move it.
      const pointsEligibleAmount = Math.max(0, subtotal - orderDiscountAmount);
      const redemption = await loyaltyService.redeemForOrder(
        {
          userId,
          requestedPoints: input.pointsToRedeem,
          eligibleAmount: pointsEligibleAmount,
          orderId,
          orderCode,
        },
        session
      );

      const totalAmount = Math.max(
        subtotal - discountAmount + input.shippingFee - redemption.discountAmount,
        0
      );
      if (input.expectedTotal !== null && totalAmount !== input.expectedTotal) {
        const error = new Error(
          `Tổng thanh toán đã thay đổi từ ${input.expectedTotal.toLocaleString("vi-VN")}đ thành ${totalAmount.toLocaleString("vi-VN")}đ. Vui lòng kiểm tra và xác nhận lại.`
        );
        error.code = "ORDER_TOTAL_CHANGED";
        error.statusCode = 409;
        error.quote = {
          subtotal,
          discountAmount,
          shippingFee: input.shippingFee,
          pointsDiscountAmount: redemption.discountAmount,
          totalAmount,
        };
        throw error;
      }
      const now = new Date();
      const order = new Order({
        _id: orderId,
        orderCode,
        user: userId,
        idempotencyKey: normalizedIdempotencyKey,
        idempotencyHash: requestHash,
        checkoutSource: input.checkoutSource,
        items: orderItems,
        subtotal,
        discountAmount,
        shippingDiscountAmount,
        shippingFee: input.shippingFee,
        pointsRedeemed: redemption.points,
        pointsDiscountAmount: redemption.discountAmount,
        pointsRedeemRate: redemption.rate,
        totalAmount,
        voucher: voucher
          ? {
              voucherId: voucher.voucherId,
              code: voucher.code,
              type: voucher.type,
              scope: voucher.scope,
              value: voucher.value,
              discountAmount: voucher.discountAmount,
            }
          : null,
        shippingVoucher: shippingVoucher
          ? {
              voucherId: shippingVoucher.voucherId,
              code: shippingVoucher.code,
              type: shippingVoucher.type,
              scope: shippingVoucher.scope,
              value: shippingVoucher.value,
              discountAmount: shippingVoucher.discountAmount,
            }
          : null,
        status: ORDER_STATUS.PENDING,
        shippingAddress: input.shippingAddress,
        shippingMethod: input.shippingMethod,
        estimatedDelivery: input.shipment?.estimatedDelivery || null,
        shipment: input.shipment || {
          provider: "manual",
          quoteId: input.shippingMethod,
          serviceName:
            input.shippingMethod === "express"
              ? "Giao nhanh 24h"
              : "Giao hàng tiêu chuẩn",
          quotedFee: input.shippingFee,
          quotedAt: now,
        },
        note: input.note,
        payment: {
          method: normalizedPaymentMethod,
          status: PAYMENT_STATUS.UNPAID,
          frontendReturnUrl: frontendUrl || "",
        },
        placedAt: now,
        expiresAt: new Date(
          now.getTime() +
            (normalizedPaymentMethod === PAYMENT_METHOD.COD
              ? COD_PENDING_TTL_MS
              : PENDING_TTL_MS)
        ),
        history: [
          {
            from: null,
            to: ORDER_STATUS.PENDING,
            by: "user",
            reason: "Order placed",
            at: now,
          },
        ],
      });

      // Commit the order and its inventory/voucher reservation before any
      // gateway request. finishOrderCreation provisions online payment after
      // this transaction has completed.
      await order.save({ session });
      if (
        order.payment.method === PAYMENT_METHOD.COD &&
        order.checkoutSource !== "BUY_NOW"
      ) {
        await removePurchasedItemsFromCart(userId, order.items, session);
      }
      return { order, replayed: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const replay = await findOrderByIdempotency(
        userId,
        normalizedIdempotencyKey
      );
      if (replay) {
        assertMatchingIdempotencyRequest(replay, requestHash);
        creationResult = { order: replay, replayed: true };
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  return finishOrderCreation(creationResult, {
    userId,
    clientIp,
    frontendUrl,
  });
}

async function retryPayment({
  orderId,
  userId,
  clientIp,
  frontendUrl,
}) {
  const now = new Date();
  const existing = await Order.findById(orderId).select(
    "+payment.checkoutUrl +payment.retryLockUntil +payment.attempts"
  );
  if (!existing) throw new Error("Order không tồn tại");
  if (String(existing.user) !== String(userId)) {
    const error = new Error("Không có quyền truy cập");
    error.code = "FORBIDDEN";
    throw error;
  }
  if (
    existing.status !== ORDER_STATUS.PENDING ||
    existing.payment.status !== PAYMENT_STATUS.UNPAID
  ) {
    throw new Error(`Đơn không còn chờ thanh toán (${existing.status})`);
  }
  if (existing.payment.method === PAYMENT_METHOD.COD) {
    throw new Error("Đơn COD không cần thanh toán online");
  }
  if (
    existing.payment.checkoutUrl &&
    existing.expiresAt &&
    existing.expiresAt > now
  ) {
    return {
      order: existing,
      paymentUrl: existing.payment.checkoutUrl,
      replayed: true,
    };
  }

  const attempts = existing.payment.attempts || [];
  const legacyProviderOrderId =
    existing.payment.providerOrderId || existing.payment.transactionId;
  const legacyAlreadyStored = attempts.some(
    (attempt) =>
      String(attempt.providerOrderId) === String(legacyProviderOrderId || "")
  );
  const attemptCount = attempts.length +
    (legacyProviderOrderId && !legacyAlreadyStored ? 1 : 0);
  if (attemptCount >= MAX_PAYMENT_ATTEMPTS_PER_ORDER) {
    const error = new Error(
      "Đơn hàng đã đạt giới hạn số lần tạo phiên thanh toán"
    );
    error.code = "PAYMENT_ATTEMPT_LIMIT";
    error.statusCode = 409;
    throw error;
  }
  const lastAttempt = attempts.at(-1);
  if (
    lastAttempt?.status === PAYMENT_ATTEMPT_STATUS.FAILED &&
    lastAttempt.createdAt &&
    now.getTime() - new Date(lastAttempt.createdAt).getTime() <
      PAYMENT_RETRY_COOLDOWN_MS
  ) {
    const error = new Error(
      "Vui lòng chờ trước khi thử tạo lại phiên thanh toán"
    );
    error.code = "PAYMENT_RETRY_COOLDOWN";
    error.statusCode = 429;
    throw error;
  }

  const lockUntil = new Date(now.getTime() + 60_000);
  const attemptId = paymentGateway.createPaymentReference(
    existing.payment.method,
    existing.orderCode
  );
  const attemptsToAppend = [];
  if (legacyProviderOrderId && !legacyAlreadyStored) {
    attemptsToAppend.push({
      providerOrderId: legacyProviderOrderId,
      method: existing.payment.method,
      amount: existing.totalAmount,
      status: legacyAttemptStatus(existing),
      checkoutUrl: existing.payment.checkoutUrl || "",
      gatewayTransactionId:
        existing.payment.transactionId === legacyProviderOrderId
          ? ""
          : existing.payment.transactionId,
      createdAt: existing.payment.providerCreatedAt || existing.placedAt,
      completedAt: existing.payment.paidAt || null,
    });
  }
  attemptsToAppend.push({
    providerOrderId: attemptId,
    method: existing.payment.method,
    amount: existing.totalAmount,
    status: PAYMENT_ATTEMPT_STATUS.CREATING,
    createdAt: now,
  });
  const claimed = await Order.findOneAndUpdate(
    {
      _id: existing._id,
      user: userId,
      status: ORDER_STATUS.PENDING,
      "payment.status": PAYMENT_STATUS.UNPAID,
      "payment.method": { $ne: PAYMENT_METHOD.COD },
      $and: [
        {
          $or: [
            { "payment.retryLockUntil": null },
            { "payment.retryLockUntil": { $lte: now } },
          ],
        },
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $lte: now } },
            { "payment.checkoutUrl": { $in: ["", null] } },
          ],
        },
      ],
    },
    {
      $set: {
        "payment.transactionId": "",
        "payment.providerOrderId": attemptId,
        "payment.providerCreatedAt": now,
        "payment.checkoutUrl": "",
        "payment.retryLockUntil": lockUntil,
        expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
      },
      $push: {
        "payment.attempts": { $each: attemptsToAppend },
      },
    },
    { returnDocument: "after" }
  ).select(
    "+payment.checkoutUrl +payment.retryLockUntil +payment.attempts"
  );

  if (!claimed) {
    const current = await Order.findById(orderId).select(
      "+payment.checkoutUrl +payment.retryLockUntil +payment.attempts"
    );
    if (
      current?.payment?.checkoutUrl &&
      current.expiresAt &&
      current.expiresAt > new Date()
    ) {
      return {
        order: current,
        paymentUrl: current.payment.checkoutUrl,
        replayed: true,
      };
    }
    const error = new Error("Một yêu cầu thanh toán khác đang được tạo");
    error.code = "PAYMENT_RETRY_IN_PROGRESS";
    throw error;
  }

  try {
    const result = await paymentGateway.createPaymentUrl({
      orderCode: claimed.orderCode,
      amount: claimed.totalAmount,
      method: claimed.payment.method,
      clientIp,
      frontendUrl:
        claimed.payment.frontendReturnUrl || frontendUrl,
      transactionId: attemptId,
    });
    const updated = await Order.findOneAndUpdate(
      {
        _id: claimed._id,
        status: ORDER_STATUS.PENDING,
        "payment.status": PAYMENT_STATUS.UNPAID,
        "payment.providerOrderId": attemptId,
        "payment.attempts": {
          $elemMatch: {
            providerOrderId: attemptId,
            status: PAYMENT_ATTEMPT_STATUS.CREATING,
          },
        },
      },
      {
        $set: {
          "payment.checkoutUrl": result.paymentUrl,
          "payment.retryLockUntil": null,
          "payment.attempts.$.checkoutUrl": result.paymentUrl,
          "payment.attempts.$.status": PAYMENT_ATTEMPT_STATUS.PENDING,
        },
      },
      { returnDocument: "after" }
    ).select("+payment.checkoutUrl +payment.attempts");
    if (!updated) {
      throw new Error("Order changed while creating the payment attempt");
    }
    return {
      order: updated,
      paymentUrl: result.paymentUrl,
      replayed: false,
    };
  } catch (error) {
    await Order.updateOne(
      {
        _id: claimed._id,
        "payment.providerOrderId": attemptId,
        status: ORDER_STATUS.PENDING,
        "payment.attempts": {
          $elemMatch: {
            providerOrderId: attemptId,
            status: PAYMENT_ATTEMPT_STATUS.CREATING,
          },
        },
      },
      {
        $set: {
          "payment.checkoutUrl": "",
          "payment.retryLockUntil": null,
          "payment.attempts.$.status": PAYMENT_ATTEMPT_STATUS.FAILED,
          "payment.attempts.$.failureReason": String(error.message || error).slice(
            0,
            500
          ),
          "payment.attempts.$.completedAt": new Date(),
        },
      }
    ).catch(() => null);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────
// Payment webhooks
// ──────────────────────────────────────────────────────────────
async function handlePaymentSuccess({
  orderCode,
  method,
  providerOrderId,
  transactionId,
  amount,
  rawPayload,
}) {
  let result = await runInTransaction(async (session) => {
    const order = await Order.findOne({ orderCode })
      .select(INTERNAL_ORDER_FIELDS)
      .session(session);
    if (!order) throw new Error(`Order ${orderCode} không tồn tại`);
    const matchedAttempt = assertPaymentCallback(order, {
      method,
      providerOrderId,
      amount,
    });
    const callbackAttempt = ensureStoredPaymentAttempt(order, matchedAttempt);
    if (!transactionId) {
      throw new Error("Payment callback transaction id is required");
    }
    if (order.payment.method === PAYMENT_METHOD.COD) {
      throw new Error("COD order cannot receive an online payment callback");
    }
    if (order.payment?.status === PAYMENT_STATUS.PAID) {
      const duplicatePayment =
        String(order.payment.providerOrderId || "") !==
        String(callbackAttempt.providerOrderId);
      let attemptChanged = false;
      if (callbackAttempt.status !== PAYMENT_ATTEMPT_STATUS.SUCCEEDED) {
        markPaymentAttemptSucceeded(callbackAttempt, transactionId, rawPayload);
        attemptChanged = true;
      }
      const executeDuplicateRefund =
        duplicatePayment &&
        prepareDuplicatePaymentRefund(order, callbackAttempt);
      if (attemptChanged || executeDuplicateRefund || matchedAttempt.legacy) {
        await order.save({ session });
      }
      return {
        order,
        alreadyProcessed: true,
        latePayment: false,
        duplicatePayment,
        executeDuplicateRefund,
        duplicateProviderOrderId: duplicatePayment
          ? callbackAttempt.providerOrderId
          : "",
      };
    }
    if ([ORDER_STATUS.REFUNDING, ORDER_STATUS.REFUNDED].includes(order.status)) {
      const duplicatePayment =
        String(order.payment.providerOrderId || "") !==
        String(callbackAttempt.providerOrderId);
      let attemptChanged = false;
      if (callbackAttempt.status !== PAYMENT_ATTEMPT_STATUS.SUCCEEDED) {
        markPaymentAttemptSucceeded(callbackAttempt, transactionId, rawPayload);
        attemptChanged = true;
      }
      const executeDuplicateRefund =
        duplicatePayment &&
        prepareDuplicatePaymentRefund(order, callbackAttempt);
      if (attemptChanged || executeDuplicateRefund || matchedAttempt.legacy) {
        await order.save({ session });
      }
      return {
        order,
        alreadyProcessed: true,
        latePayment: true,
        duplicatePayment,
        executeDuplicateRefund,
        duplicateProviderOrderId: duplicatePayment
          ? callbackAttempt.providerOrderId
          : "",
      };
    }
    if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED].includes(order.status)) {
      const capturedTransactionId =
        transactionId || order.payment.transactionId;
      const originalStatus = order.status;
      const refundReason = `Late payment for ${originalStatus.toLowerCase()} order`;
      const now = new Date();
      markPaymentAttemptSucceeded(callbackAttempt, transactionId, rawPayload);
      order.inventoryRestoredAt = order.inventoryRestoredAt || now;
      order.payment.transactionId = capturedTransactionId;
      order.payment.providerOrderId = callbackAttempt.providerOrderId;
      order.payment.providerCreatedAt = callbackAttempt.createdAt || order.placedAt;
      order.payment.retryLockUntil = null;
      order.payment.checkoutUrl = "";
      order.payment.rawPayload = rawPayload || null;
      order.payment.paidAt = order.payment.paidAt || now;
      order.paidAt = order.paidAt || now;
      prepareRefundRequest(order, {
        idempotencyKey: `late-payment-refund:${order.orderCode}`,
        reason: refundReason,
        initiatedBy: "system",
        transitionBy: "gateway",
        transitionReason:
          "Payment arrived after inventory was released; automatic refund requested",
      });
      order.expiresAt = null;
      await order.save({ session });
      return {
        order,
        alreadyProcessed: false,
        latePayment: true,
        executeRefund: true,
      };
    }
    if (order.status !== ORDER_STATUS.PENDING) {
      throw new Error(
        `Không thể thanh toán, order đang ở trạng thái ${order.status}`
      );
    }

    order.applyTransition(ORDER_STATUS.PAID, {
      by: "gateway",
      reason: "Payment succeeded",
    });
    markPaymentAttemptSucceeded(callbackAttempt, transactionId, rawPayload);
    order.payment.transactionId = transactionId || order.payment.transactionId;
    order.payment.providerOrderId = callbackAttempt.providerOrderId;
    order.payment.providerCreatedAt = callbackAttempt.createdAt || order.placedAt;
    order.payment.retryLockUntil = null;
    order.payment.checkoutUrl = "";
    order.payment.rawPayload = rawPayload || null;
    order.expiresAt = null;
    await order.save({ session });
    if (order.checkoutSource !== "BUY_NOW") {
      await removePurchasedItemsFromCart(order.user, order.items, session);
    }
    return { order, alreadyProcessed: false, latePayment: false };
  });

  if (result.executeRefund) {
    const refundResult = await executePendingRefund(result.order._id);
    result = { ...result, order: refundResult.order || result.order };
  }
  if (result.executeDuplicateRefund) {
    const duplicateRefund = await executeDuplicatePaymentRefund(
      result.order._id,
      result.duplicateProviderOrderId
    );
    result = {
      ...result,
      order: duplicateRefund.order || result.order,
      duplicateRefundCompleted: duplicateRefund.completed,
    };
  }

  const { order, alreadyProcessed, latePayment } = result;
  if (alreadyProcessed) return result;
  if (latePayment) {
    const refundCompleted = order.status === ORDER_STATUS.REFUNDED;
    await notifyUserSafe(order.user, {
      type: "refund",
      title: refundCompleted
        ? "Thanh toán đến muộn - đã hoàn tiền"
        : "Thanh toán đến muộn - đang hoàn tiền",
      message: refundCompleted
        ? `Thanh toán cho đơn ${order.orderCode} đến sau khi đơn đã đóng và đã được hoàn lại.`
        : `Thanh toán cho đơn ${order.orderCode} đến sau khi đơn đã đóng. Hệ thống đang tự động hoàn tiền.`,
      link: `/profile/orders/${order._id}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
    return result;
  }
  await notifyUserSafe(order.user, {
    type: "payment",
    title: "Thanh toán thành công",
    message: `Đơn hàng ${order.orderCode} đã được thanh toán thành công.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  await AnalyticsEvent.updateOne(
    { type: "payment_success", order: order._id },
    {
      $setOnInsert: {
        user: order.user,
        value: order.totalAmount,
        metadata: { orderCode: order.orderCode, transactionId },
      },
    },
    { upsert: true }
  ).catch(() => null);
  return result;
}

async function handlePaymentFailed({
  orderCode,
  method,
  providerOrderId,
  amount,
  reason,
  rawPayload,
}) {
  const result = await runInTransaction(async (session) => {
    const order = await Order.findOne({ orderCode })
      .select(INTERNAL_ORDER_FIELDS)
      .session(session);
    if (!order) throw new Error(`Order ${orderCode} không tồn tại`);
    const matchedAttempt = assertPaymentCallback(order, {
      method,
      providerOrderId,
      amount,
    });
    const callbackAttempt = ensureStoredPaymentAttempt(order, matchedAttempt);
    const attemptChanged = markPaymentAttemptFailed(
      callbackAttempt,
      reason,
      rawPayload
    );
    const isCurrentAttempt =
      String(order.payment.providerOrderId || "") ===
      String(callbackAttempt.providerOrderId);
    if (
      order.status !== ORDER_STATUS.PENDING ||
      !isCurrentAttempt ||
      !attemptChanged
    ) {
      if (attemptChanged || matchedAttempt.legacy) {
        await order.save({ session });
      }
      return { order, changed: false };
    }

    if (!order.inventoryRestoredAt) {
      await restoreItems(order.items, session, {
        orderId: order._id,
        orderCode: order.orderCode,
        reason: "Thanh toán thất bại",
      });
      order.inventoryRestoredAt = new Date();
    }
    await releaseOrderVoucher(order, session);
    await loyaltyService.refundOrderPoints(order, session, {
      reason: `Hoàn điểm đơn ${order.orderCode} do thanh toán thất bại`,
    });
    order.applyTransition(ORDER_STATUS.FAILED, {
      by: "gateway",
      reason: reason || "Payment failed",
    });
    order.payment.rawPayload = rawPayload || null;
    order.payment.retryLockUntil = null;
    order.payment.checkoutUrl = "";
    order.expiresAt = null;
    await order.save({ session });
    return { order, changed: true };
  });

  const { order, changed } = result;
  if (!changed) return order;
  await notifyUserSafe(order.user, {
    type: "payment",
    title: "Thanh toán thất bại",
    message: `Thanh toán cho đơn hàng ${order.orderCode} không thành công.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

// ──────────────────────────────────────────────────────────────
// Admin actions
// ──────────────────────────────────────────────────────────────
async function adminApproveOrder(orderId, adminId) {
  const order = await runInTransaction(async (session) => {
    const current = await Order.findById(orderId).session(session);
    if (!current) throw new Error("Order không tồn tại");
    const isCOD = current.payment.method === PAYMENT_METHOD.COD;
    if (isCOD) {
      if (current.status !== ORDER_STATUS.PENDING) {
        throw new Error(`Không thể xác nhận, status = ${current.status}`);
      }
    } else if (current.status !== ORDER_STATUS.PAID) {
      throw new Error(
        `Đơn online cần thanh toán thành công trước khi duyệt, status = ${current.status}`
      );
    }

    current.applyTransition(ORDER_STATUS.PROCESSING, {
      by: `admin:${adminId}`,
      reason: isCOD ? "COD confirmed" : "Online payment approved",
    });
    current.expiresAt = null;
    await current.save({ session });
    return current;
  });
  await notifyUserSafe(order.user, {
    type: "order",
    title: "Đơn hàng đã xác nhận",
    message: `Đơn hàng ${order.orderCode} đang được xử lý.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

const adminConfirmCOD = adminApproveOrder;

async function adminCancelOrder(orderId, adminId, reason = "") {
  const normalizedReason = String(reason || "").trim().slice(0, 500);
  const order = await runInTransaction(async (session) => {
    const current = await Order.findById(orderId)
      .select(INTERNAL_ORDER_FIELDS)
      .session(session);
    if (!current) throw new Error("Order không tồn tại");

    const canCancelPending = current.status === ORDER_STATUS.PENDING;
    const canCancelProcessingCod =
      current.status === ORDER_STATUS.PROCESSING &&
      current.payment.method === PAYMENT_METHOD.COD;
    if (!canCancelPending && !canCancelProcessingCod) {
      throw new Error(
        `Admin không thể huỷ đơn ở trạng thái ${current.status}`
      );
    }

    if (!current.inventoryRestoredAt) {
      await restoreItems(current.items, session, {
        orderId: current._id,
        orderCode: current.orderCode,
        reason: normalizedReason || "Admin huỷ đơn",
        performedBy: adminId,
      });
      current.inventoryRestoredAt = new Date();
    }
    await releaseOrderVoucher(current, session);
    await loyaltyService.refundOrderPoints(current, session, {
      reason: `Hoàn điểm đơn ${current.orderCode} do huỷ đơn`,
    });
    current.applyTransition(ORDER_STATUS.CANCELLED, {
      by: `admin:${adminId}`,
      reason: normalizedReason || "Cancelled by admin",
    });
    current.expiresAt = null;
    await current.save({ session });
    return current;
  });

  await notifyUserSafe(order.user, {
    type: "order",
    title: "Đơn hàng đã bị huỷ",
    message: `Đơn hàng ${order.orderCode} đã bị huỷ bởi cửa hàng.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

async function adminMarkShipped(orderId, adminId, tracking = {}) {
  const order = await runInTransaction(async (session) => {
    const current = await Order.findById(orderId).session(session);
    if (!current) throw new Error("Order không tồn tại");
    if (tracking.carrier) current.carrier = String(tracking.carrier).trim();
    if (tracking.trackingNumber) {
      current.trackingNumber = String(tracking.trackingNumber).trim();
    }
    if (tracking.estimatedDelivery) {
      const d = new Date(tracking.estimatedDelivery);
      if (!Number.isNaN(d.getTime())) current.estimatedDelivery = d;
    }
    current.applyTransition(ORDER_STATUS.SHIPPED, {
      by: `admin:${adminId}`,
      reason: "Handed to carrier",
    });
    // The goods leave the warehouse here. `stock` lost them at order time, so
    // this releases the reservation and drops onHand - after this point a
    // stocktake should no longer expect to find them on the shelf.
    await dispatchItems(current.items, session, {
      orderId: current._id,
      orderCode: current.orderCode,
      reason: "Bàn giao cho đơn vị vận chuyển",
      // The carrier simulation ships orders under an actor string rather than a
      // user id, and the ledger's performedBy is a real User reference; the
      // transition history above already records who acted either way.
      performedBy: mongoose.isValidObjectId(adminId) ? adminId : null,
    });
    current.trackingEvents.push({
      status: "SHIPPED",
      description: "Đơn hàng đã bàn giao cho đơn vị vận chuyển",
      at: new Date(),
    });
    await current.save({ session });
    return current;
  });
  await notifyUserSafe(order.user, {
    type: "shipping",
    title: "Đơn hàng đang giao",
    message: `Đơn hàng ${order.orderCode} đang trên đường giao đến bạn.`,
    link: `/profile/orders/${order._id}`,
    metadata: {
      orderId: order._id,
      orderCode: order.orderCode,
      trackingNumber: order.trackingNumber,
      carrier: order.carrier,
    },
  });
  return order;
}

async function adminMarkDelivered(orderId, adminId) {
  const order = await runInTransaction(async (session) => {
    // INTERNAL_ORDER_FIELDS is required, not cosmetic: pointsEarnedAt is
    // select:false, so without it the idempotency marker reads as undefined
    // and never persists.
    const current = await Order.findById(orderId)
      .select(INTERNAL_ORDER_FIELDS)
      .session(session);
    if (!current) throw new Error("Order không tồn tại");
    current.applyTransition(ORDER_STATUS.DELIVERED, {
      by: `admin:${adminId}`,
      reason: "Delivered to customer",
    });
    for (const item of current.items) {
      await incrementSold(item.book, item.quantity, session);
    }
    // Delivery is where revenue is recognised, so it is also where points are
    // earned. This is the only way into DELIVERED for a normal order.
    await loyaltyService.earnForOrder(current, session, {
      // The carrier simulation marks orders delivered under an actor string
      // rather than a user id, and the ledger's performedBy is a User ref.
      performedBy: mongoose.isValidObjectId(adminId) ? adminId : null,
    });
    current.trackingEvents.push({
      status: "DELIVERED",
      description: "Đơn hàng đã giao đến khách hàng",
      at: new Date(),
    });
    await current.save({ session });
    return current;
  });
  await notifyUserSafe(order.user, {
    type: "shipping",
    title: "Đơn hàng đã giao",
    message: `Đơn hàng ${order.orderCode} đã được giao thành công.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  if (order.pointsEarned > 0) {
    await notifyUserSafe(order.user, {
      type: "loyalty",
      title: `+${order.pointsEarned} điểm thưởng`,
      message: `Bạn vừa nhận ${order.pointsEarned} điểm từ đơn ${order.orderCode}.`,
      link: "/profile/points",
      metadata: {
        orderId: order._id,
        orderCode: order.orderCode,
        points: order.pointsEarned,
      },
    });
  }
  const firstBookId = order.items?.[0]?.book;
  if (firstBookId) {
    await notifyUserSafe(order.user, {
      type: "review",
      title: "Bạn thấy sách thế nào?",
      message: `Đơn hàng ${order.orderCode} đã được giao. Hãy chia sẻ trải nghiệm để giúp những độc giả khác.`,
      link: `/books/${firstBookId}#reviews`,
      metadata: {
        orderId: order._id,
        orderCode: order.orderCode,
        bookId: firstBookId,
      },
    });
  }
  return order;
}

async function finalizeShipmentCancellation({ eventId, lockToken }) {
  let result = await runInTransaction(async (session) => {
    const event = await OrderOutboxEvent.findOne({
      _id: eventId,
      status: OrderOutboxEvent.STATUS.PROCESSING,
      lockToken,
    }).session(session);
    if (!event) return null;

    const order = await Order.findOne({
      _id: event.order,
      status: ORDER_STATUS.CANCELLING,
    })
      .select(INTERNAL_ORDER_FIELDS)
      .session(session);
    if (!order) {
      event.status = OrderOutboxEvent.STATUS.COMPLETED;
      event.completedAt = new Date();
      event.lockUntil = null;
      event.lockToken = "";
      await event.save({ session });
      return null;
    }

    if (order.shipment?.providerOrderCode) {
      order.shipment.providerStatus = "cancel";
      order.shipment.cancelledAt = order.shipment.cancelledAt || new Date();
      order.shipment.simulation.enabled = false;
      order.shipment.simulation.nextAt = null;
      if (!order.trackingEvents.some((entry) => entry.status === "CANCELLED")) {
        order.trackingEvents.push({
          status: "CANCELLED",
          description: "Đã hủy vận đơn GHN Sandbox",
          at: new Date(),
        });
      }
    }

    const previousStatus = event.payload.previousStatus;
    const isDirectCancellation =
      previousStatus === ORDER_STATUS.PENDING ||
      (previousStatus === ORDER_STATUS.PROCESSING &&
        order.payment.method === PAYMENT_METHOD.COD);
    let executeRefund = false;
    if (isDirectCancellation) {
      if (!order.inventoryRestoredAt) {
        await restoreItems(order.items, session, {
          orderId: order._id,
          orderCode: order.orderCode,
          reason: "Huỷ đơn hàng",
        });
        order.inventoryRestoredAt = new Date();
      }
      await releaseOrderVoucher(order, session);
      await loyaltyService.refundOrderPoints(order, session, {
        reason: `Hoàn điểm đơn ${order.orderCode} do huỷ vận đơn`,
      });
      order.applyTransition(ORDER_STATUS.CANCELLED, {
        by: event.payload.requestedBy,
        reason: event.payload.reason || "Cancellation completed",
      });
      order.expiresAt = null;
    } else if (
      previousStatus === ORDER_STATUS.PAID ||
      previousStatus === ORDER_STATUS.PROCESSING
    ) {
      prepareRefundRequest(order, {
        idempotencyKey: `refund:${order.orderCode}`,
        reason: event.payload.reason || "Order cancellation requested",
        initiatedBy: event.payload.requestedBy,
        clientIp: event.payload.clientIp,
        transitionBy: event.payload.requestedBy,
        transitionReason: event.payload.reason || "Order cancellation requested",
      });
      executeRefund = true;
    } else {
      throw new Error(`Cannot finalize cancellation from ${previousStatus}`);
    }

    await order.save({ session });
    event.status = OrderOutboxEvent.STATUS.COMPLETED;
    event.completedAt = new Date();
    event.lockUntil = null;
    event.lockToken = "";
    event.lastError = "";
    await event.save({ session });
    return { order, executeRefund };
  });

  if (!result) return null;
  if (result.executeRefund) {
    const refundResult = await executePendingRefund(result.order._id);
    result = { ...result, order: refundResult.order || result.order };
  }

  const { order } = result;
  await notifyUserSafe(order.user, {
    type: order.status === ORDER_STATUS.CANCELLED ? "order" : "refund",
    title:
      order.status === ORDER_STATUS.CANCELLED
        ? "Đơn hàng đã hủy"
        : order.status === ORDER_STATUS.REFUNDED
          ? "Hoàn tiền thành công"
          : "Đã yêu cầu hoàn tiền",
    message:
      order.status === ORDER_STATUS.CANCELLED
        ? `Đơn hàng ${order.orderCode} đã được hủy.`
        : order.status === ORDER_STATUS.REFUNDED
          ? `Đơn hàng ${order.orderCode} đã được hoàn tiền thành công.`
          : `Yêu cầu hoàn tiền cho đơn hàng ${order.orderCode} đang được xử lý.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

// ──────────────────────────────────────────────────────────────
// Cancel / Refund
// ──────────────────────────────────────────────────────────────
async function cancelOrder(orderId, userId, reason = "", clientIp = "") {
  const normalizedReason = String(reason || "").trim().slice(0, 500);
  let result = await runInTransaction(async (session) => {
    const order = await Order.findById(orderId)
      .select(INTERNAL_ORDER_FIELDS)
      .session(session);
    if (!order) throw new Error("Order không tồn tại");
    if (order.user.toString() !== userId.toString()) {
      throw new Error("Không có quyền hủy đơn này");
    }

    const status = order.status;
    if (status === ORDER_STATUS.REFUNDING) {
      return { order, notificationType: "refunding", executeRefund: false };
    }
    const terminal = [
      ORDER_STATUS.SHIPPED,
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.REFUNDED,
      ORDER_STATUS.FAILED,
    ];
    if (terminal.includes(status)) {
      throw new Error(`Không thể hủy đơn ở trạng thái ${status}`);
    }

    const isCodProcessing =
      order.payment.method === PAYMENT_METHOD.COD &&
      status === ORDER_STATUS.PROCESSING;
    if (status === ORDER_STATUS.PENDING || isCodProcessing) {
      if (!order.inventoryRestoredAt) {
        await restoreItems(order.items, session, {
          orderId: order._id,
          orderCode: order.orderCode,
          reason: normalizedReason || "Khách hàng huỷ đơn",
          performedBy: order.user,
        });
        order.inventoryRestoredAt = new Date();
      }
      await releaseOrderVoucher(order, session);
      await loyaltyService.refundOrderPoints(order, session, {
        reason: `Hoàn điểm đơn ${order.orderCode} do khách huỷ`,
      });
      order.applyTransition(ORDER_STATUS.CANCELLED, {
        by: "user",
        reason: normalizedReason || "Cancelled by customer",
      });
      order.expiresAt = null;
      await order.save({ session });
      return { order, notificationType: "cancelled" };
    }

    if (status === ORDER_STATUS.PAID || status === ORDER_STATUS.PROCESSING) {
      prepareRefundRequest(order, {
        idempotencyKey: `refund:${order.orderCode}`,
        reason: normalizedReason || "Customer requested refund",
        initiatedBy: `user:${userId}`,
        clientIp,
        transitionBy: "user",
        transitionReason: normalizedReason || "Customer requested refund",
      });
      await order.save({ session });
      return {
        order,
        notificationType: "refunding",
        executeRefund: true,
      };
    }

    throw new Error(`Không thể hủy đơn ở trạng thái ${status}`);
  });

  if (result.executeRefund) {
    const refundResult = await executePendingRefund(result.order._id);
    const order = refundResult.order || result.order;
    result = {
      ...result,
      order,
      notificationType:
        order.status === ORDER_STATUS.REFUNDED ? "refunded" : "refunding",
    };
  }

  const { order, notificationType } = result;
  if (notificationType === "cancelled") {
    await notifyUserSafe(order.user, {
      type: "order",
      title: "Đơn hàng đã hủy",
      message: `Đơn hàng ${order.orderCode} đã được hủy.`,
      link: `/profile/orders/${order._id}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
  } else if (notificationType === "refunding") {
    await notifyUserSafe(order.user, {
      type: "refund",
      title: "Đã yêu cầu hoàn tiền",
      message: `Yêu cầu hoàn tiền cho đơn hàng ${order.orderCode} đang được xử lý.`,
      link: `/profile/orders/${order._id}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
  } else {
    await notifyUserSafe(order.user, {
      type: "refund",
      title: "Hoàn tiền thành công",
      message: `Đơn hàng ${order.orderCode} đã được hoàn tiền thành công.`,
      link: `/profile/orders/${order._id}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
  }
  return order;
}

async function handleRefundSuccess({
  orderCode,
  refundTransactionId,
  rawPayload,
}) {
  const result = await runInTransaction(async (session) => {
    const order = await Order.findOne({ orderCode })
      .select(INTERNAL_ORDER_FIELDS)
      .session(session);
    if (!order) throw new Error(`Order ${orderCode} không tồn tại`);
    if (!refundTransactionId) {
      throw new Error("Refund callback transaction id is required");
    }
    if (
      !order.payment.refundTransactionId ||
      String(order.payment.refundTransactionId) !== String(refundTransactionId)
    ) {
      throw new Error("Refund callback transaction id does not match the order");
    }
    if (
      order.payment.refundBusinessType !== "ORDER" ||
      String(order.payment.refundSourceId || "") !== String(order._id) ||
      Number(order.payment.refundAmount) !== Number(order.totalAmount) ||
      String(order.payment.refundOriginalPaymentTransactionId || "") !==
        String(order.payment.transactionId || "") ||
      String(order.payment.refundOriginalProviderOrderId || "") !==
        String(order.payment.providerOrderId || "")
    ) {
      throw new Error("Refund callback identity does not match the order refund");
    }
    if (order.status === ORDER_STATUS.REFUNDED) {
      return { order, changed: false };
    }
    if (order.status !== ORDER_STATUS.REFUNDING) {
      throw new Error(
        `Order ${orderCode} không ở trạng thái REFUNDING (hiện: ${order.status})`
      );
    }

    await completeRefund(order, session, rawPayload);
    order.payment.refundTransactionId =
      refundTransactionId || order.payment.refundTransactionId;
    await order.save({ session });
    return { order, changed: true };
  });

  const { order, changed } = result;
  if (!changed) return order;
  await notifyUserSafe(order.user, {
    type: "refund",
    title: "Hoàn tiền thành công",
    message: `Đơn hàng ${order.orderCode} đã được hoàn tiền thành công.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

// ──────────────────────────────────────────────────────────────
// TTL job: PENDING quá hạn thanh toán/xác nhận → CANCELLED + trả stock
// ──────────────────────────────────────────────────────────────
async function expirePendingOrders() {
  const expired = await Order.find(expiredPendingFilter()).limit(100);

  const results = [];
  for (const pending of expired) {
    try {
      const order = await runInTransaction(async (session) => {
        const current = await Order.findOne({
          _id: pending._id,
          ...expiredPendingFilter(),
        })
          .select(INTERNAL_ORDER_FIELDS)
          .session(session);
        if (!current) return null;
        if (!current.inventoryRestoredAt) {
          await restoreItems(current.items, session, {
            orderId: current._id,
            orderCode: current.orderCode,
            reason: "Đơn hết hạn thanh toán",
          });
          current.inventoryRestoredAt = new Date();
        }
        await releaseOrderVoucher(current, session);
        await loyaltyService.refundOrderPoints(current, session, {
          reason: `Hoàn điểm đơn ${current.orderCode} do hết hạn thanh toán`,
        });
        current.applyTransition(ORDER_STATUS.CANCELLED, {
          by: "system",
          reason:
            current.payment.method === PAYMENT_METHOD.COD
              ? "Auto-cancel: COD confirmation timed out"
              : "Auto-cancel: online payment timed out",
        });
        current.expiresAt = null;
        await current.save({ session });
        return current;
      });
      if (!order) continue;
      await notifyUserSafe(order.user, {
        type: "order",
        title: "Đơn hàng đã hết hạn",
        message: `Đơn hàng ${order.orderCode} đã bị hủy do quá thời gian thanh toán.`,
        link: `/profile/orders/${order._id}`,
        metadata: { orderId: order._id, orderCode: order.orderCode },
      });
      results.push(order.orderCode);
    } catch (err) {
      console.error(
        `[orderTTL] Failed to expire ${pending.orderCode}:`,
        err.message
      );
    }
  }
  return results;
}

async function reconcilePendingRefunds(limit = 20) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const now = new Date();
  const candidates = await Order.find({
    status: ORDER_STATUS.REFUNDING,
    "payment.refundTransactionId": { $in: ["", null] },
    "payment.refundIdempotencyKey": { $nin: ["", null] },
    $and: [
      {
        $or: [
          { "payment.refundNextRetryAt": null },
          { "payment.refundNextRetryAt": { $lte: now } },
        ],
      },
      {
        $or: [
          { "payment.refundRetryLockUntil": null },
          { "payment.refundRetryLockUntil": { $lte: now } },
        ],
      },
    ],
  })
    .select("_id")
    .sort({ "payment.refundNextRetryAt": 1 })
    .limit(boundedLimit);

  let attempted = 0;
  for (const candidate of candidates) {
    try {
      const result = await executePendingRefund(candidate._id);
      if (result.attempted) attempted += 1;
    } catch (error) {
      console.error(
        `[refund] Failed to reconcile order ${candidate._id}:`,
        error.message
      );
    }
  }

  // A refund instruction that already has a gateway transaction id has moved
  // past submission and must be queried, not silently dropped from the retry
  // queue. Only a verified matching query result is allowed to complete it.
  const processingCandidates = await Order.find({
    status: ORDER_STATUS.REFUNDING,
    "payment.status": PAYMENT_STATUS.REFUNDING,
    "payment.refundTransactionId": { $nin: ["", null] },
    "payment.refundIdempotencyKey": { $nin: ["", null] },
  })
    .select(INTERNAL_ORDER_FIELDS)
    .limit(boundedLimit);

  for (const order of processingCandidates) {
    try {
      const result = await paymentGateway.queryRefundStatus({
        method: order.payment.method,
        providerOrderId:
          order.payment.providerOrderId || order.payment.transactionId,
        transactionId: order.payment.transactionId,
        providerCreatedAt:
          order.payment.providerCreatedAt || order.placedAt,
        idempotencyKey: order.payment.refundIdempotencyKey,
        amount: order.payment.refundAmount || order.totalAmount,
        originalAmount: order.totalAmount,
        reason: order.payment.refundReason,
        clientIp: order.payment.refundClientIp,
      });
      if (!result.ok || !result.completed) continue;
      await handleRefundSuccess({
        orderCode: order.orderCode,
        refundTransactionId: order.payment.refundTransactionId,
        rawPayload: result.rawPayload,
      });
      attempted += 1;
    } catch (error) {
      console.error(
        `[refund] Failed to query accepted refund for order ${order._id}:`,
        error.message
      );
    }
  }

  const duplicateCandidates = await Order.find({
    "payment.attempts": {
      $elemMatch: {
        status: PAYMENT_ATTEMPT_STATUS.SUCCEEDED,
        "duplicateRefund.status": DUPLICATE_REFUND_STATUS.PENDING,
        $and: [
          {
            $or: [
              { "duplicateRefund.nextRetryAt": null },
              { "duplicateRefund.nextRetryAt": { $lte: now } },
            ],
          },
          {
            $or: [
              { "duplicateRefund.lockUntil": null },
              { "duplicateRefund.lockUntil": { $lte: now } },
            ],
          },
        ],
      },
    },
  })
    .select("_id +payment.attempts")
    .limit(boundedLimit);

  for (const candidate of duplicateCandidates) {
    const dueAttempts = candidate.payment.attempts.filter((attempt) => {
      const refund = attempt.duplicateRefund;
      return (
        attempt.status === PAYMENT_ATTEMPT_STATUS.SUCCEEDED &&
        refund?.status === DUPLICATE_REFUND_STATUS.PENDING &&
        (!refund.nextRetryAt || refund.nextRetryAt <= now) &&
        (!refund.lockUntil || refund.lockUntil <= now)
      );
    });
    for (const attempt of dueAttempts) {
      try {
        const result = await executeDuplicatePaymentRefund(
          candidate._id,
          attempt.providerOrderId
        );
        if (result.attempted) attempted += 1;
      } catch (error) {
        console.error(
          `[refund] Failed duplicate capture ${attempt.providerOrderId}:`,
          error.message
        );
      }
    }
  }
  return attempted;
}

// Orders that died holding a voucher or spent points, where the release never
// landed — a crashed worker, a lost transaction. Vouchers and points are
// reclaimed together because they die together.
//
// The two conditions are wrapped in $and rather than written as two top-level
// $or keys: a JavaScript object literal silently keeps only the last of two
// identical keys, which would quietly drop half the filter.
const DEAD_ORDER_STATUSES = [
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.REFUNDED,
];

function unreleasedOrderFilter() {
  return {
    status: { $in: DEAD_ORDER_STATUSES },
    $and: [
      {
        $or: [
          { voucher: { $ne: null } },
          { shippingVoucher: { $ne: null } },
          { pointsRedeemed: { $gt: 0 } },
        ],
      },
      {
        $or: [{ voucherReleasedAt: null }, { pointsRefundedAt: null }],
      },
    ],
  };
}

async function reconcileVoucherReleases(limit = 1_000) {
  const candidates = await Order.find(unreleasedOrderFilter())
    .select("_id")
    .limit(limit);

  let released = 0;
  for (const candidate of candidates) {
    try {
      const changed = await runInTransaction(async (session) => {
        const order = await Order.findOne({
          _id: candidate._id,
          ...unreleasedOrderFilter(),
        })
          .select(INTERNAL_ORDER_FIELDS)
          .session(session);
        if (!order) return false;
        await releaseOrderVoucher(order, session);
        await loyaltyService.refundOrderPoints(order, session, {
          reason: `Hoàn điểm đơn ${order.orderCode} (đối soát)`,
        });
        await order.save({ session });
        return true;
      });
      if (changed) released += 1;
    } catch (error) {
      if (!/write conflict|transienttransactionerror/i.test(error.message)) {
        console.error(
          `[voucher] Failed to reconcile order ${candidate._id}:`,
          error.message
        );
      }
    }
  }
  return released;
}

module.exports = {
  createOrder,
  retryPayment,
  handlePaymentSuccess,
  handlePaymentFailed,
  adminApproveOrder,
  adminConfirmCOD,
  adminCancelOrder,
  adminMarkShipped,
  adminMarkDelivered,
  finalizeShipmentCancellation,
  cancelOrder,
  handleRefundSuccess,
  completeLostInTransitRefund,
  expirePendingOrders,
  executePendingRefund,
  executeDuplicatePaymentRefund,
  reconcilePendingRefunds,
  reconcileVoucherReleases,
  applyVoucher,
  assertPaymentCallback,
  PENDING_TTL_MS,
  COD_PENDING_TTL_MS,
  MAX_PENDING_COD_PER_USER,
  MAX_PENDING_ONLINE_PER_USER,
  MAX_PAYMENT_ATTEMPTS_PER_ORDER,
  PAYMENT_RETRY_COOLDOWN_MS,
};
