const crypto = require("crypto");
const Order = require("../models/Order");
const OrderOutboxEvent = require("../models/OrderOutboxEvent");
const { runInTransaction } = require("../utils/transaction");
const orderService = require("./orderService");
const shippingService = require("./shippingService");

const LOCK_MS = 60 * 1000;
const MAX_RETRY_MS = 60 * 60 * 1000;

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
  return runInTransaction(async (session) => {
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
    return { order, event, replayed: false };
  });
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
    await OrderOutboxEvent.updateOne(
      {
        _id: event._id,
        status: OrderOutboxEvent.STATUS.PROCESSING,
        lockToken,
      },
      {
        $set: {
          status: OrderOutboxEvent.STATUS.PENDING,
          nextAttemptAt: new Date(Date.now() + retryDelay(attempts)),
          lockUntil: null,
          lockToken: "",
          lastError: String(error.message || error).slice(0, 500),
        },
      }
    );
    return { processed: true, completed: false, error };
  }
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
  processOne,
  processPending,
  requestAdminCancellation,
  requestCustomerCancellation,
};
