const crypto = require("crypto");
const Order = require("../models/Order");
const OrderOutboxEvent = require("../models/OrderOutboxEvent");
const { runInTransaction } = require("../utils/transaction");
const orderService = require("./orderService");
const shippingService = require("./shippingService");
const notificationService = require("./notificationService");

const LOCK_MS = 60 * 1000;
const MAX_RETRY_MS = 60 * 60 * 1000;
// With the backoff below this is roughly an hour of retries. A carrier that
// still refuses by then (typically: parcel already picked up) will not change
// its mind, so the order is handed to staff instead of retrying forever.
const MAX_ATTEMPTS = 8;

function cancellationError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function retryDelay(attempts) {
  return Math.min(30_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 8), MAX_RETRY_MS);
}

async function requestCancellation({
  orderId,
  actorType,
  actorId,
  reason = "",
  clientIp = "",
}) {
  const normalizedReason = String(reason || "").trim().slice(0, 500);
  const result = await runInTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      throw cancellationError("Order không tồn tại", "ORDER_NOT_FOUND", 404);
    }
    if (actorType === "user" && String(order.user) !== String(actorId)) {
      throw cancellationError(
        "Không có quyền hủy đơn này",
        "ORDER_CANCELLATION_FORBIDDEN",
        403
      );
    }

    if (order.status === Order.STATUS.CANCELLING) {
      const event = await OrderOutboxEvent.findOne({
        order: order._id,
        type: OrderOutboxEvent.TYPE.SHIPMENT_CANCEL_REQUESTED,
      }).session(session);
      return { order, event, replayed: true };
    }

    const previousStatus = order.status;
    const userCanCancel = [
      Order.STATUS.PENDING,
      Order.STATUS.PAID,
      Order.STATUS.PROCESSING,
    ].includes(previousStatus);
    const adminCanCancel = [
      Order.STATUS.PENDING,
      Order.STATUS.PAID,
      Order.STATUS.PROCESSING,
    ].includes(previousStatus);
    if (
      (actorType === "user" && !userCanCancel) ||
      (actorType === "admin" && !adminCanCancel)
    ) {
      throw cancellationError(
        `Không thể hủy đơn ở trạng thái ${previousStatus}`,
        "INVALID_CANCELLATION_STATE"
      );
    }

    const requestedBy = `${actorType}:${actorId}`;
    if (previousStatus === Order.STATUS.PENDING) {
      const cancelled = await orderService.cancelPendingOrderInSession(
        order._id,
        session,
        { by: requestedBy, reason: normalizedReason }
      );
      return { order: cancelled, event: null, replayed: false, cancelled: true };
    }
    order.applyTransition(Order.STATUS.CANCELLING, {
      by: requestedBy,
      reason: normalizedReason || "Cancellation requested",
    });
    order.cancelReason = normalizedReason;
    await order.save({ session });

    const [event] = await OrderOutboxEvent.create(
      [
        {
          type: OrderOutboxEvent.TYPE.SHIPMENT_CANCEL_REQUESTED,
          order: order._id,
          idempotencyKey: `shipment-cancel:${order._id}`,
          payload: {
            previousStatus,
            requestedBy,
            reason: normalizedReason,
            clientIp: String(clientIp || "").slice(0, 100),
          },
        },
      ],
      { session }
    );
    return { order, event, replayed: false, cancelled: false };
  });
  if (result.cancelled) await orderService.notifyOrderCancelled(result.order);
  return result;
}

function requestCustomerCancellation(orderId, userId, reason, clientIp) {
  return requestCancellation({
    orderId,
    actorType: "user",
    actorId: userId,
    reason,
    clientIp,
  });
}

function requestAdminCancellation(orderId, adminId, reason) {
  return requestCancellation({
    orderId,
    actorType: "admin",
    actorId: adminId,
    reason,
  });
}

async function claimEvent({ eventId = null, now = new Date() } = {}) {
  const lockToken = crypto.randomUUID();
  const event = await OrderOutboxEvent.findOneAndUpdate(
    {
      ...(eventId ? { _id: eventId } : {}),
      type: OrderOutboxEvent.TYPE.SHIPMENT_CANCEL_REQUESTED,
      nextAttemptAt: { $lte: now },
      $or: [
        { status: OrderOutboxEvent.STATUS.PENDING },
        {
          status: OrderOutboxEvent.STATUS.PROCESSING,
          lockUntil: { $lte: now },
        },
      ],
    },
    {
      $set: {
        status: OrderOutboxEvent.STATUS.PROCESSING,
        lockToken,
        lockUntil: new Date(now.getTime() + LOCK_MS),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after", sort: { nextAttemptAt: 1, _id: 1 } }
  );
  return event ? { event, lockToken } : null;
}

async function processOne(options = {}) {
  const claimed = await claimEvent(options);
  if (!claimed) return { processed: false };
  const { event, lockToken } = claimed;

  try {
    const order = await Order.findById(event.order);
    if (order?.shipment?.providerOrderCode && !order.shipment.cancelledAt) {
      await shippingService.cancelGhnShipmentAtProvider(order);
    }
    const finalizedOrder = await orderService.finalizeShipmentCancellation({
      eventId: event._id,
      lockToken,
    });
    return { processed: true, completed: true, order: finalizedOrder };
  } catch (error) {
    const attempts = Number(event.attempts) || 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const lastError = String(error.message || error).slice(0, 500);
    const parked = await OrderOutboxEvent.updateOne(
      {
        _id: event._id,
        status: OrderOutboxEvent.STATUS.PROCESSING,
        lockToken,
      },
      {
        $set: {
          status: exhausted
            ? OrderOutboxEvent.STATUS.FAILED
            : OrderOutboxEvent.STATUS.PENDING,
          nextAttemptAt: exhausted
            ? null
            : new Date(Date.now() + retryDelay(attempts)),
          lockUntil: null,
          lockToken: "",
          lastError,
        },
      }
    );
    if (exhausted && parked.modifiedCount === 1) {
      const order = await Order.findById(event.order).select("orderCode").lean();
      await notificationService
        .notifyAdmins({
          type: "order",
          title: "Huỷ đơn cần xử lý thủ công",
          message: `Không huỷ được vận đơn của đơn ${order?.orderCode || event.order} sau ${attempts} lần thử: ${lastError}`,
          link: `/admin/orders/${event.order}`,
          metadata: { orderId: event.order, orderCode: order?.orderCode },
        })
        .catch(() => null);
    }
    return { processed: true, completed: false, exhausted, error };
  }
}

// Staff put a parked cancellation back in the queue, e.g. after checking with
// the carrier or once its credentials work again.
async function retryFailedCancellation(orderId) {
  const event = await OrderOutboxEvent.findOneAndUpdate(
    {
      order: orderId,
      type: OrderOutboxEvent.TYPE.SHIPMENT_CANCEL_REQUESTED,
      status: OrderOutboxEvent.STATUS.FAILED,
    },
    {
      $set: {
        status: OrderOutboxEvent.STATUS.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        lockUntil: null,
        lockToken: "",
      },
    },
    { returnDocument: "after" }
  );
  if (!event) {
    throw cancellationError(
      "Đơn không có yêu cầu huỷ đang chờ xử lý thủ công",
      "NO_FAILED_CANCELLATION",
      409
    );
  }
  return event;
}

async function processPending({ limit = 20 } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  let processed = 0;
  let completed = 0;
  let failed = 0;
  for (let index = 0; index < boundedLimit; index += 1) {
    const result = await processOne();
    if (!result.processed) break;
    processed += 1;
    if (result.completed) completed += 1;
    else failed += 1;
  }
  return { processed, completed, failed };
}

module.exports = {
  MAX_ATTEMPTS,
  processOne,
  processPending,
  retryFailedCancellation,
  requestAdminCancellation,
  requestCustomerCancellation,
};
