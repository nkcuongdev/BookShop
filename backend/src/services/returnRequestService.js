const mongoose = require("mongoose");
const crypto = require("node:crypto");
const Book = require("../models/Book");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
// The model, not supportResolutionService: that service imports this one, so
// depending on it here would close a require cycle.
const SupportTicket = require("../models/SupportTicket");
const paymentGateway = require("./paymentGateway");
const { runInTransaction } = require("../utils/transaction");
const loyaltyService = require("./loyaltyService");
const inventoryService = require("./inventoryService");
const {
  claimReturnRequestAssets,
  normalizeReturnImageUrls,
  releaseReturnRequestAssetClaims,
} = require("./assetLifecycleService");

// A customer changing their mind has 7 days; a mistake by the shop (wrong,
// damaged, missing goods, or a parcel that never arrived) can be claimed for
// 30 days, and the shop pays the return shipping.
const RETURN_WINDOW_DAYS = 7;
const SHOP_FAULT_WINDOW_DAYS = 30;
const RETURN_WINDOW_MS = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const SHOP_FAULT_WINDOW_MS = SHOP_FAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const REFUND_LOCK_MS = 2 * 60 * 1000;

function serviceError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function deliveredAtFor(order) {
  if (order?.deliveredAt) return new Date(order.deliveredAt);
  const history = Array.isArray(order?.history) ? order.history : [];
  const deliveredEntry = history
    .slice()
    .reverse()
    .find((entry) => entry?.to === Order.STATUS.DELIVERED && entry?.at);
  return deliveredEntry ? new Date(deliveredEntry.at) : null;
}

/**
 * @param {object} order
 * @param {object|null} existingRequest
 * @param {Date|{now?: Date, faultParty?: "shop"|"customer"}} [options]
 *   A Date is still accepted for the original `now` positional argument.
 *   `faultParty: "shop"` grants the longer claim window.
 */
function getReturnEligibility(order, existingRequest = null, options = new Date()) {
  const { now = new Date(), faultParty = "customer" } =
    options instanceof Date ? { now: options } : options || {};
  const shopFault = faultParty === "shop";
  const windowDays = shopFault ? SHOP_FAULT_WINDOW_DAYS : RETURN_WINDOW_DAYS;
  const windowMs = shopFault ? SHOP_FAULT_WINDOW_MS : RETURN_WINDOW_MS;
  const returnShippingPaidBy = shopFault ? "shop" : "customer";
  const deliveredAt = deliveredAtFor(order);
  const deadline = deliveredAt ? new Date(deliveredAt.getTime() + windowMs) : null;
  const requests = Array.isArray(existingRequest)
    ? existingRequest
    : existingRequest
      ? [existingRequest]
      : [];
  const used = new Map();
  for (const request of requests) {
    if (request?.status === ReturnRequest.STATUS.REJECTED) continue;
    for (const item of request?.items || []) {
      const key = String(item.book?._id || item.book || "");
      used.set(key, (used.get(key) || 0) + (Number(item.quantity) || 0));
    }
  }
  const remainingItems = (order?.items || []).map((item) => {
    const bookId = String(item.book?._id || item.book || "");
    return {
      bookId,
      quantity: Math.max(0, (Number(item.quantity) || 0) - (used.get(bookId) || 0)),
    };
  });
  const base = { deadline, windowDays, faultParty, returnShippingPaidBy, remainingItems };
  if (order?.status !== Order.STATUS.DELIVERED) {
    return { ...base, eligible: false, code: "ORDER_NOT_DELIVERED" };
  }
  if (!deliveredAt || Number.isNaN(deliveredAt.getTime())) {
    return { ...base, eligible: false, code: "DELIVERY_DATE_MISSING", deadline: null };
  }
  if (now.getTime() > deadline.getTime()) {
    return { ...base, eligible: false, code: "RETURN_WINDOW_EXPIRED" };
  }
  if (!remainingItems.some((item) => item.quantity > 0)) {
    return { ...base, eligible: false, code: "RETURN_QUANTITY_EXHAUSTED" };
  }
  return { ...base, eligible: true, code: "ELIGIBLE" };
}

function serializeReturnRequest(request) {
  if (!request) return null;
  const value = request.toObject ? request.toObject() : request;
  return {
    _id: value._id,
    id: value._id,
    order: value.order?._id || value.order,
    items: value.items || [],
    reason: value.reason,
    details: value.details,
    images: value.images || [],
    status: value.status,
    adminNote: value.adminNote || "",
    returnCode: value.returnCode || "",
    returnInstructions: value.returnInstructions || "",
    returnShippingPaidBy: value.returnShippingPaidBy || "customer",
    expectedRefundAmount: Number(value.expectedRefundAmount) || 0,
    inventoryDisposition: value.inventoryDisposition || null,
    receivedAt: value.receivedAt,
    closedAt: value.closedAt,
    refund: value.refund
      ? {
          status: value.refund.status,
          amount: Number(value.refund.amount) || 0,
          transactionId: value.refund.transactionId || "",
          lastError: value.refund.lastError || "",
          completedAt: value.refund.completedAt,
        }
      : null,
    resolvedAt: value.resolvedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeReturnItems(order, submittedItems) {
  if (!Array.isArray(submittedItems) || submittedItems.length < 1) {
    throw serviceError(
      422,
      "Vui lòng chọn ít nhất một sản phẩm cần đổi trả",
      "RETURN_ITEMS_REQUIRED"
    );
  }
  if (submittedItems.length > Math.min(50, order.items.length)) {
    throw serviceError(422, "Danh sách sản phẩm đổi trả không hợp lệ", "INVALID_RETURN_ITEMS");
  }

  const orderItems = new Map(
    order.items.map((item) => [String(item.book?._id || item.book), item])
  );
  const seen = new Set();

  return submittedItems.map((submitted) => {
    const bookId = String(submitted?.bookId || "").trim();
    if (!mongoose.isValidObjectId(bookId) || seen.has(bookId)) {
      throw serviceError(422, "Sản phẩm đổi trả không hợp lệ", "INVALID_RETURN_ITEM");
    }
    seen.add(bookId);
    const orderItem = orderItems.get(bookId);
    const quantity = submitted?.quantity;
    if (
      !orderItem ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > orderItem.quantity
    ) {
      throw serviceError(
        422,
        "Số lượng đổi trả vượt quá số lượng đã mua",
        "INVALID_RETURN_QUANTITY"
      );
    }
    return {
      book: orderItem.book?._id || orderItem.book,
      title: String(orderItem.title || "Sản phẩm").slice(0, 300),
      author: String(orderItem.author || "").slice(0, 200),
      imageUrl: String(orderItem.imageUrl || "").slice(0, 2048),
      unitPrice: orderItem.price,
      orderedQuantity: orderItem.quantity,
      quantity,
    };
  });
}

function normalizeReturnPayload(order, payload = {}) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
  const reason = String(source.reason || "").trim().toUpperCase();
  const details = String(source.details || "").trim();
  if (!Object.values(ReturnRequest.REASON).includes(reason)) {
    throw serviceError(422, "Lý do đổi trả không hợp lệ", "INVALID_RETURN_REASON");
  }
  if (details.length < 10 || details.length > 1000) {
    throw serviceError(
      422,
      "Mô tả đổi trả cần từ 10 đến 1000 ký tự",
      "INVALID_RETURN_DETAILS"
    );
  }
  return {
    items: normalizeReturnItems(order, source.items),
    reason,
    details,
    images: normalizeReturnImageUrls(source.images ?? []),
  };
}

async function createReturnRequest({
  orderId,
  userId,
  payload,
  now = new Date(),
  faultParty = null,
}) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) {
    throw serviceError(404, "Không tìm thấy đơn hàng", "ORDER_NOT_FOUND");
  }
  const normalized = normalizeReturnPayload(order, payload);
  const resolvedFaultParty =
    faultParty ||
    (normalized.reason === ReturnRequest.REASON.OTHER ? "customer" : "shop");
  const existing = await ReturnRequest.find({ order: order._id }).lean();
  const eligibility = getReturnEligibility(order, existing, {
    now,
    faultParty: resolvedFaultParty,
  });
  const remainingByBook = new Map(
    eligibility.remainingItems.map((item) => [item.bookId, item.quantity])
  );
  if (normalized.items.some((item) =>
    Number(item.quantity) > (remainingByBook.get(String(item.book)) || 0)
  )) {
    throw serviceError(
      409,
      "Số lượng yêu cầu vượt quá quyền lợi đổi trả còn lại",
      "RETURN_QUANTITY_EXCEEDED"
    );
  }
  if (!eligibility.eligible) {
    const messages = {
      RETURN_QUANTITY_EXHAUSTED: "Toàn bộ số lượng có thể đổi trả đã được yêu cầu",
      ORDER_NOT_DELIVERED: "Chỉ đơn hàng đã giao mới có thể yêu cầu đổi trả",
      DELIVERY_DATE_MISSING: "Đơn hàng chưa có thời điểm giao hợp lệ",
      RETURN_WINDOW_EXPIRED: `Đã quá thời hạn đổi trả ${eligibility.windowDays} ngày`,
    };
    throw serviceError(
      eligibility.code === "RETURN_QUANTITY_EXHAUSTED" ? 409 : 422,
      messages[eligibility.code],
      eligibility.code
    );
  }
  let requestId = null;
  let claimedImages = [];
  let requestSaved = false;
  try {
    requestId = new mongoose.Types.ObjectId();
    claimedImages = await claimReturnRequestAssets(
      requestId,
      userId,
      normalized.images
    );
    const request = await runInTransaction(async (session) => {
      const lockedOrder = await Order.findOneAndUpdate(
        { _id: order._id, user: userId },
        { $set: { returnRequestGuardAt: new Date() } },
        { returnDocument: "after", session }
      );
      const currentRequests = await ReturnRequest.find({ order: order._id })
        .session(session)
        .lean();
      const currentEligibility = getReturnEligibility(lockedOrder, currentRequests, {
        now,
        faultParty: resolvedFaultParty,
      });
      const currentRemaining = new Map(
        currentEligibility.remainingItems.map((item) => [item.bookId, item.quantity])
      );
      if (normalized.items.some((item) =>
        Number(item.quantity) > (currentRemaining.get(String(item.book)) || 0)
      )) {
        throw serviceError(
          409,
          "Quyền lợi đổi trả vừa thay đổi, vui lòng kiểm tra lại",
          "RETURN_QUANTITY_EXCEEDED"
        );
      }
      if (!currentEligibility.eligible) {
        throw serviceError(
          409,
          "Đã sử dụng hết số lượng có thể đổi trả của đơn hàng",
          currentEligibility.code
        );
      }
      const [created] = await ReturnRequest.create([{
        _id: requestId,
        order: order._id,
        user: userId,
        returnShippingPaidBy: currentEligibility.returnShippingPaidBy,
        ...normalized,
      }], { session });
      return created;
    });
    requestSaved = true;
    return { request, order };
  } catch (error) {
    if (requestId && claimedImages.length && !requestSaved) {
      await releaseReturnRequestAssetClaims(requestId, claimedImages).catch(() => {});
    }
    throw error;
  }
}

async function resolveReturnRequest({ orderId, adminId, status, adminNote }) {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const note = String(adminNote || "").trim();
  if (![ReturnRequest.STATUS.APPROVED, ReturnRequest.STATUS.REJECTED].includes(normalizedStatus)) {
    throw serviceError(422, "Trạng thái xử lý không hợp lệ", "INVALID_RETURN_STATUS");
  }
  if (note.length > 1000) {
    throw serviceError(
      422,
      "Phản hồi không được vượt quá 1000 ký tự",
      "INVALID_ADMIN_NOTE"
    );
  }
  if (normalizedStatus === ReturnRequest.STATUS.REJECTED && note.length < 3) {
    throw serviceError(
      422,
      "Vui lòng nhập lý do từ chối từ 3 đến 1000 ký tự",
      "INVALID_ADMIN_NOTE"
    );
  }

  const existing = await ReturnRequest.findOne({
    order: orderId,
    status: ReturnRequest.STATUS.PENDING,
  }).sort({ createdAt: -1, _id: -1 }).populate(
    "order",
    "orderCode user"
  );
  if (!existing) {
    const anyRequest = await ReturnRequest.exists({ order: orderId });
    throw anyRequest
      ? serviceError(409, "Yêu cầu đổi trả đã được xử lý", "RETURN_REQUEST_RESOLVED")
      : serviceError(404, "Không tìm thấy yêu cầu đổi trả", "RETURN_REQUEST_NOT_FOUND");
  }

  const persistedStatus = normalizedStatus === ReturnRequest.STATUS.APPROVED
    ? ReturnRequest.STATUS.RETURNING
    : normalizedStatus;
  const now = new Date();
  const request = await ReturnRequest.findOneAndUpdate(
    { _id: existing._id, status: ReturnRequest.STATUS.PENDING },
    {
      $set: {
        status: persistedStatus,
        adminNote: note,
        returnInstructions: persistedStatus === ReturnRequest.STATUS.RETURNING
          ? (note || "Vui lÃ²ng Ä‘Ã³ng gÃ³i sáº£n pháº©m vÃ  ghi mÃ£ tráº£ hÃ ng trÃªn kiá»‡n.")
          : "",
        returnCode: persistedStatus === ReturnRequest.STATUS.RETURNING
          ? `RT-${existing._id.toString().slice(-8).toUpperCase()}`
          : "",
        resolvedBy: adminId,
        resolvedAt: now,
      },
    },
    { returnDocument: "after", runValidators: true, sort: { createdAt: -1, _id: -1 } }
  ).populate("order", "orderCode user");
  if (!request) {
    throw serviceError(409, "Yêu cầu đổi trả đã được xử lý", "RETURN_REQUEST_RESOLVED");
  }
  return request;
}

function calculateRefundAmount(order, items) {
  const returnedGross = items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * Number(item.quantity),
    0
  );
  const orderSubtotal = Math.max(0, Number(order.subtotal) || 0);
  const allItemsReturned = order.items.every((orderItem) => {
    const returned = items.find(
      (item) => String(item.book) === String(orderItem.book?._id || orderItem.book)
    );
    return returned && Number(returned.quantity) === Number(orderItem.quantity);
  });
  if (allItemsReturned) return Math.max(0, Math.round(Number(order.totalAmount) || 0));

  // `discountAmount` is the *total* saving on the order: money off the books
  // plus money off the delivery. Only the goods half may be spread across the
  // returned books - a free-shipping voucher did not make the books cheaper, so
  // charging it back against them would under-refund the customer. The delivery
  // fee and its discount belong to the shipment, which was still performed, and
  // so are not touched by a partial return.
  const shippingDiscount = Math.max(0, Number(order.shippingDiscountAmount) || 0);
  const goodsDiscount = Math.max(
    0,
    (Number(order.discountAmount) || 0) - shippingDiscount
  );
  const pointsDiscount = Math.max(0, Number(order.pointsDiscountAmount) || 0);
  const allocatedDiscount = orderSubtotal > 0
    ? Math.round((goodsDiscount + pointsDiscount) * returnedGross / orderSubtotal)
    : 0;
  return Math.max(0, Math.round(returnedGross - allocatedDiscount));
}

async function receiveReturnRequest({ orderId, adminId, restock = true }) {
  const result = await runInTransaction(async (session) => {
    const request = await ReturnRequest.findOne({
      order: orderId,
      status: { $in: [ReturnRequest.STATUS.RETURNING, ReturnRequest.STATUS.APPROVED] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .select("+inventoryAdjustedAt +refund.idempotencyKey +refund.requestedAt +refund.nextRetryAt +refund.retryCount +refund.lockUntil +refund.lockToken")
      .session(session);
    if (!request) {
      const anyRequest = await ReturnRequest.exists({ order: orderId }).session(session);
      throw anyRequest
        ? serviceError(409, "Yêu cầu không ở trạng thái chờ nhận hàng", "INVALID_RETURN_TRANSITION")
        : serviceError(404, "Không tìm thấy yêu cầu đổi trả", "RETURN_REQUEST_NOT_FOUND");
    }
    // reservedRefundAmount is select:false, but the refund cap below has to see
    // money already committed to an in-flight support refund.
    const order = await Order.findById(orderId)
      .select("+supportCompensation.reservedRefundAmount")
      .session(session);
    if (!order) throw serviceError(404, "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng", "ORDER_NOT_FOUND");

    if (restock) {
      // Returned goods must move through the inventory ledger like any
      // other stock change, so the audit trail stays complete.
      for (const item of request.items) {
        try {
          await inventoryService.applyMovement(
            {
              bookId: item.book,
              type: "RETURN_IN",
              quantity: Number(item.quantity),
              refType: "Order",
              refId: order._id,
              refCode: order.orderCode,
              reason: "Khach tra hang - nhap lai kho",
              performedBy: adminId,
            },
            session
          );
        } catch (error) {
          if (error.code === "BOOK_NOT_FOUND") {
            throw serviceError(409, "KhÃ´ng thá»ƒ Ä‘á»‘i chiáº¿u Ä‘á»§ sáº£n pháº©m Ä‘á»ƒ nháº­p kho", "RETURN_BOOK_MISSING");
          }
          throw error;
        }
        // `sold` is a sales metric, not stock, so it is adjusted directly.
        await Book.updateOne(
          { _id: item.book, sold: { $gte: Number(item.quantity) } },
          { $inc: { sold: -Number(item.quantity) } },
          { session }
        );
      }
    } else {
      // Not restocked: the goods came back damaged. Stock never went up, so
      // only the sales metric is reversed.
      for (const item of request.items) {
        await Book.updateOne(
          { _id: item.book, sold: { $gte: Number(item.quantity) } },
          { $inc: { sold: -Number(item.quantity) } },
          { session }
        );
      }
    }

    const now = new Date();
    // Both refund channels draw on the same pot. A support ticket may already
    // have compensated part of this order, so the return can only claim what is
    // left of totalAmount after money already refunded and money reserved for
    // an in-flight refund. Reserving inside this transaction closes the window
    // where two channels each see the full headroom.
    const requestedRefund = calculateRefundAmount(order, request.items);
    const alreadyRefunded = Number(order.supportCompensation?.refundedAmount) || 0;
    const alreadyReserved = Number(order.supportCompensation?.reservedRefundAmount) || 0;
    const headroom = Math.max(
      0,
      Math.round(Number(order.totalAmount) || 0) - alreadyRefunded - alreadyReserved
    );
    const refundAmount = Math.min(requestedRefund, headroom);
    if (refundAmount > 0) {
      const reserved = await Order.updateOne(
        {
          _id: order._id,
          $expr: {
            $lte: [
              {
                $add: [
                  { $ifNull: ["$supportCompensation.refundedAmount", 0] },
                  { $ifNull: ["$supportCompensation.reservedRefundAmount", 0] },
                  refundAmount,
                ],
              },
              "$totalAmount",
            ],
          },
        },
        { $inc: { "supportCompensation.reservedRefundAmount": refundAmount } },
        { session }
      );
      if (reserved.modifiedCount !== 1) {
        throw serviceError(
          409,
          "Khoản hoàn vượt quá số tiền còn có thể hoàn của đơn",
          "REFUND_LIMIT_EXCEEDED"
        );
      }
    }
    const canAutoRefund = refundAmount > 0 &&
      order.payment?.method !== Order.PAYMENT_METHOD.COD &&
      Boolean(order.payment?.transactionId);
    request.status = ReturnRequest.STATUS.RECEIVED;
    request.receivedBy = adminId;
    request.receivedAt = now;
    request.inventoryAdjustedAt = now;
    request.inventoryDisposition = restock ? "RESTOCK" : "DAMAGED";
    request.expectedRefundAmount = refundAmount;
    request.refund.amount = refundAmount;
    request.refund.businessType = "RETURN";
    request.refund.sourceId = String(request._id);
    request.refund.paymentMethod = order.payment?.method;
    request.refund.originalPaymentTransactionId = String(
      order.payment?.transactionId || ""
    );
    request.refund.originalProviderOrderId = String(
      order.payment?.providerOrderId || ""
    );
    request.refund.status = canAutoRefund
      ? ReturnRequest.REFUND_STATUS.PENDING
      : refundAmount > 0
        ? ReturnRequest.REFUND_STATUS.MANUAL_REQUIRED
        // Nothing left to refund on this order - the goods still come back,
        // but there is no payment to reverse.
        : ReturnRequest.REFUND_STATUS.NONE;
    request.refund.idempotencyKey = `return-refund:${request._id}`;
    request.refund.requestedAt = now;
    request.refund.nextRetryAt = canAutoRefund ? now : null;
    await request.save({ session });

    // Goods coming back take their loyalty points with them, in proportion to
    // the value returned: a customer sending back one book of five keeps the
    // points the other four earned. Keyed by the return, since one order can
    // accumulate several over time.
    await loyaltyService.revokeOrderPointsPartial(
      order,
      {
        refundedGoodsAmount: refundAmount,
        returnId: request._id,
        returnCode: request.returnCode || "",
      },
      session
    );
    await loyaltyService.refundOrderPointsPartial(
      order,
      {
        returnedGrossAmount: request.items.reduce(
          (sum, item) => sum + Number(item.unitPrice) * Number(item.quantity),
          0
        ),
        returnId: request._id,
        returnCode: request.returnCode || "",
      },
      session
    );

    return { requestId: request._id, autoRefund: canAutoRefund };
  });

  if (result.autoRefund) await executeReturnRefund(result.requestId);
  return ReturnRequest.findById(result.requestId).populate("order", "orderCode user");
}

function refundRetryDelay(retryCount) {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(retryCount, 7));
}

async function recordReturnRefundFailure(requestId, lockToken, error) {
  const current = await ReturnRequest.findOne({
    _id: requestId,
    status: ReturnRequest.STATUS.RECEIVED,
    "refund.lockToken": lockToken,
  }).select("+refund.retryCount");
  if (!current) return null;
  const retryCount = (Number(current.refund.retryCount) || 0) + 1;
  await ReturnRequest.updateOne(
    { _id: requestId, "refund.lockToken": lockToken },
    {
      $set: {
        "refund.lastError": String(error?.message || error || "Refund failed").slice(0, 500),
        "refund.retryCount": retryCount,
        "refund.nextRetryAt": new Date(Date.now() + refundRetryDelay(retryCount)),
        "refund.lockUntil": null,
        "refund.lockToken": "",
      },
    }
  );
  return ReturnRequest.findById(requestId);
}

/**
 * Move a return's refund from "reserved" to "refunded" on the shared order
 * cap. Called once the money has actually left, so the headroom is consumed
 * rather than held. Guarded by the reserved balance so a repeated settlement
 * cannot double-count.
 */
async function settleReturnRefundReservation(orderId, amount, session = null) {
  const value = Math.round(Number(amount) || 0);
  if (value <= 0) return;
  await Order.updateOne(
    { _id: orderId, "supportCompensation.reservedRefundAmount": { $gte: value } },
    {
      $inc: {
        "supportCompensation.reservedRefundAmount": -value,
        "supportCompensation.refundedAmount": value,
      },
    },
    session ? { session } : undefined
  );
}

async function executeReturnRefund(requestId) {
  const now = new Date();
  const lockToken = crypto.randomUUID();
  const claimed = await ReturnRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: ReturnRequest.STATUS.RECEIVED,
      "refund.status": ReturnRequest.REFUND_STATUS.PENDING,
      $and: [
        { $or: [{ "refund.nextRetryAt": null }, { "refund.nextRetryAt": { $lte: now } }] },
        { $or: [{ "refund.lockUntil": null }, { "refund.lockUntil": { $lte: now } }] },
      ],
    },
    { $set: { "refund.lockToken": lockToken, "refund.lockUntil": new Date(now.getTime() + REFUND_LOCK_MS) } },
    { returnDocument: "after" }
  )
    .select("+refund.idempotencyKey +refund.retryCount +refund.nextRetryAt +refund.lockUntil +refund.lockToken")
    .populate("order");
  if (!claimed) return { attempted: false, request: await ReturnRequest.findById(requestId) };

  let gatewayResult;
  try {
    gatewayResult = await paymentGateway.requestRefund({
      method: claimed.order.payment.method,
      providerOrderId: claimed.order.payment.providerOrderId || claimed.order.payment.transactionId,
      transactionId: claimed.order.payment.transactionId,
      providerCreatedAt: claimed.order.payment.providerCreatedAt || claimed.order.placedAt,
      amount: claimed.refund.amount,
      originalAmount: claimed.order.totalAmount,
      reason: `Return ${claimed.returnCode || claimed._id}`,
      idempotencyKey: claimed.refund.idempotencyKey,
      initiatedBy: "return-workflow",
    });
  } catch (error) {
    await recordReturnRefundFailure(claimed._id, lockToken, error);
    return { attempted: true, completed: false, request: await ReturnRequest.findById(requestId) };
  }
  if (
    !gatewayResult.ok ||
    !String(gatewayResult.refundTransactionId || "").trim()
  ) {
    await recordReturnRefundFailure(claimed._id, lockToken, gatewayResult.error);
    return { attempted: true, completed: false, request: await ReturnRequest.findById(requestId) };
  }

  // `ok` only means the gateway accepted the instruction; `completed` means the
  // money actually moved. VNPay answers ok/not-completed while it settles, so
  // closing the request here would tell the customer they had been refunded and
  // drop the record out of the retry job's queue for good.
  const settled = Boolean(gatewayResult.completed);
  const settledAt = new Date();
  const update = settled
    ? {
        status: ReturnRequest.STATUS.CLOSED,
        closedAt: settledAt,
        "refund.status": ReturnRequest.REFUND_STATUS.COMPLETED,
        "refund.completedAt": settledAt,
      }
    : {
        // Stays RECEIVED so the request is still visibly in flight, and the
        // reconciliation pass can pick it up by refund status.
        "refund.status": ReturnRequest.REFUND_STATUS.PROCESSING,
        "refund.completedAt": null,
      };

  const request = await ReturnRequest.findOneAndUpdate(
    { _id: claimed._id, status: ReturnRequest.STATUS.RECEIVED, "refund.lockToken": lockToken },
    {
      $set: {
        ...update,
        "refund.transactionId": String(gatewayResult.refundTransactionId || ""),
        "refund.lastError": "",
        "refund.nextRetryAt": null,
        "refund.lockUntil": null,
        "refund.lockToken": "",
      },
    },
    { returnDocument: "after" }
  ).populate("order", "orderCode user");
  if (request && settled) {
    await settleReturnRefundReservation(
      request.order?._id || request.order,
      claimed.refund.amount
    );
    // Reached from both the admin API and the retry job, so the linked ticket
    // closes on whichever attempt actually succeeds.
    await syncLinkedTicket(request);
  }
  return {
    attempted: true,
    accepted: Boolean(request),
    completed: Boolean(request) && settled,
    request,
  };
}

async function closeManualReturn({ orderId, transactionId }) {
  const reference = String(transactionId || "").trim();
  if (reference.length < 3 || reference.length > 250) {
    throw serviceError(422, "Vui lÃ²ng nháº­p mÃ£ giao dá»‹ch hoÃ n tiá»n", "REFUND_REFERENCE_REQUIRED");
  }
  const now = new Date();
  const request = await ReturnRequest.findOneAndUpdate(
    {
      order: orderId,
      status: ReturnRequest.STATUS.RECEIVED,
      "refund.status": ReturnRequest.REFUND_STATUS.MANUAL_REQUIRED,
    },
    {
      $set: {
        status: ReturnRequest.STATUS.CLOSED,
        closedAt: now,
        "refund.status": ReturnRequest.REFUND_STATUS.COMPLETED,
        "refund.transactionId": reference,
        "refund.completedAt": now,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      sort: { createdAt: -1, _id: -1 },
    }
  ).populate("order", "orderCode user");
  if (!request) {
    throw serviceError(409, "YÃªu cáº§u khÃ´ng thá»ƒ Ä‘Ã³ng á»Ÿ tráº¡ng thÃ¡i hiá»‡n táº¡i", "INVALID_RETURN_TRANSITION");
  }
  await settleReturnRefundReservation(
    request.order?._id || request.order,
    request.refund?.amount
  );
  await syncLinkedTicket(request);
  return request;
}

async function advanceReturnRequest({ orderId, adminId, status, adminNote, restock, refundTransactionId }) {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  if ([ReturnRequest.STATUS.APPROVED, ReturnRequest.STATUS.REJECTED].includes(normalizedStatus)) {
    return resolveReturnRequest({ orderId, adminId, status: normalizedStatus, adminNote });
  }
  if (normalizedStatus === ReturnRequest.STATUS.RECEIVED) {
    return receiveReturnRequest({ orderId, adminId, restock: restock !== false });
  }
  if (normalizedStatus === ReturnRequest.STATUS.CLOSED) {
    return closeManualReturn({ orderId, transactionId: refundTransactionId });
  }
  throw serviceError(422, "Tráº¡ng thÃ¡i xá»­ lÃ½ khÃ´ng há»£p lá»‡", "INVALID_RETURN_STATUS");
}

/**
 * Settlement entry point for a refund the gateway accepted but had not yet
 * completed, mirroring `orderService.handleRefundSuccess`. Called once a
 * callback or reconciliation pass confirms the money reached the customer.
 * Idempotent: a request already CLOSED reports `changed: false`.
 */
async function completeReturnRefund({ orderId, refundTransactionId, now = new Date() }) {
  const existing = await ReturnRequest.findOne({
    order: orderId,
    "refund.transactionId": String(refundTransactionId || "").trim(),
  }).sort({ createdAt: -1, _id: -1 });
  if (!existing) {
    throw serviceError(404, "Không tìm thấy yêu cầu đổi trả", "RETURN_REQUEST_NOT_FOUND");
  }
  const reference = String(refundTransactionId || "").trim();
  if (
    !reference ||
    !existing.refund?.transactionId ||
    String(existing.refund.transactionId) !== reference
  ) {
    throw serviceError(
      409,
      "Mã giao dịch hoàn tiền không khớp với yêu cầu đổi trả",
      "REFUND_REFERENCE_MISMATCH"
    );
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw serviceError(404, "Không tìm thấy đơn hàng", "ORDER_NOT_FOUND");
  }
  if (
    existing.refund.businessType !== "RETURN" ||
    String(existing.refund.sourceId || "") !== String(existing._id) ||
    Number(existing.refund.amount) !== Number(existing.expectedRefundAmount) ||
    existing.refund.paymentMethod !== order.payment?.method ||
    String(existing.refund.originalPaymentTransactionId || "") !==
      String(order.payment?.transactionId || "") ||
    String(existing.refund.originalProviderOrderId || "") !==
      String(order.payment?.providerOrderId || "")
  ) {
    throw serviceError(
      409,
      "Thông tin định danh khoản hoàn đổi trả không khớp",
      "REFUND_IDENTITY_MISMATCH"
    );
  }
  if (
    existing.status === ReturnRequest.STATUS.CLOSED &&
    existing.refund?.status === ReturnRequest.REFUND_STATUS.COMPLETED
  ) {
    return { request: existing, changed: false };
  }
  const request = await ReturnRequest.findOneAndUpdate(
    {
      _id: existing._id,
      status: ReturnRequest.STATUS.RECEIVED,
      "refund.status": ReturnRequest.REFUND_STATUS.PROCESSING,
      "refund.transactionId": reference,
      "refund.businessType": "RETURN",
      "refund.sourceId": String(existing._id),
      "refund.amount": Number(existing.expectedRefundAmount),
    },
    {
      $set: {
        status: ReturnRequest.STATUS.CLOSED,
        closedAt: now,
        "refund.status": ReturnRequest.REFUND_STATUS.COMPLETED,
        "refund.transactionId": reference,
        "refund.completedAt": now,
        "refund.lastError": "",
        "refund.nextRetryAt": null,
        "refund.lockUntil": null,
        "refund.lockToken": "",
      },
    },
    { returnDocument: "after" }
  ).populate("order", "orderCode user");
  if (!request) {
    throw serviceError(
      409,
      "Yêu cầu đổi trả không ở trạng thái chờ cổng thanh toán quyết toán",
      "INVALID_RETURN_TRANSITION"
    );
  }
  await settleReturnRefundReservation(
    request.order?._id || request.order,
    request.refund?.amount
  );
  await syncLinkedTicket(request);
  return { request, changed: true };
}

/**
 * Bring the support ticket behind a return in line with the return's outcome.
 *
 * A return can close down two different paths - an admin confirming the refund
 * through the API, or the retry job succeeding on a later attempt - and the
 * ticket has to follow either way. Keeping this in the service means the job
 * cannot silently leave a ticket stuck in RETURNING while the return is closed.
 *
 * Idempotent: each branch matches on the statuses it is allowed to move from,
 * so replaying it neither double-posts an event nor reopens a closed ticket.
 */
async function syncLinkedTicket(request, actorId = null) {
  if (!request) return null;
  const requestId = request._id || request;

  if (request.status === ReturnRequest.STATUS.CLOSED) {
    const completedAt = request.closedAt || new Date();
    return SupportTicket.findOneAndUpdate(
      {
        "resolution.returnRequest": requestId,
        "resolution.type": "RETURN_REFUND",
        "resolution.status": { $ne: "RETURN_COMPLETED" },
      },
      {
        $set: {
          "resolution.status": "RETURN_COMPLETED",
          "resolution.completedAt": completedAt,
          status: "RESOLVED",
          resolvedAt: completedAt,
        },
        $push: {
          "resolution.events": {
            type: "RETURN_COMPLETED",
            by: actorId,
            note: request.refund?.transactionId || "",
          },
        },
      },
      { returnDocument: "after" }
    );
  }

  if (request.status === ReturnRequest.STATUS.REJECTED) {
    return SupportTicket.findOneAndUpdate(
      {
        "resolution.returnRequest": requestId,
        "resolution.type": "RETURN_REFUND",
        "resolution.status": { $ne: "FAILED" },
      },
      {
        $set: { "resolution.status": "FAILED" },
        $push: {
          "resolution.events": {
            type: "RETURN_REJECTED",
            by: actorId,
            note: request.adminNote || "",
          },
        },
      },
      { returnDocument: "after" }
    );
  }

  return null;
}

async function processPendingReturnRefunds({ limit = 20 } = {}) {
  const now = new Date();
  const candidates = await ReturnRequest.find({
    status: ReturnRequest.STATUS.RECEIVED,
    "refund.status": ReturnRequest.REFUND_STATUS.PENDING,
    $and: [
      { $or: [{ "refund.nextRetryAt": null }, { "refund.nextRetryAt": { $lte: now } }] },
      { $or: [{ "refund.lockUntil": null }, { "refund.lockUntil": { $lte: now } }] },
    ],
  }).select("_id").limit(limit).lean();
  let completed = 0;
  for (const candidate of candidates) {
    const result = await executeReturnRefund(candidate._id);
    if (result.completed) completed += 1;
  }
  return { processed: candidates.length, completed };
}

/**
 * Chase up refunds the gateway accepted but has not settled.
 *
 * `executeReturnRefund` leaves a request in PROCESSING when VNPay answers
 * ok-but-not-completed. Nothing else moves it: the customer's money is in
 * flight and only the gateway knows when it lands. This asks.
 *
 * Deliberately conservative about failure. A lookup that errors (network down,
 * bad signature) proves nothing about the refund, so the request stays
 * PROCESSING and is retried later; only an explicit terminal failure from the
 * gateway sends it back for a retry of the refund itself.
 */
async function reconcileProcessingRefunds({ limit = 20 } = {}) {
  const candidates = await ReturnRequest.find({
    status: ReturnRequest.STATUS.RECEIVED,
    "refund.status": ReturnRequest.REFUND_STATUS.PROCESSING,
  })
    .select("+refund.idempotencyKey +refund.requestedAt")
    .populate("order")
    .limit(limit);

  let settled = 0;
  let stillPending = 0;
  let failed = 0;

  for (const request of candidates) {
    const order = request.order;
    if (!order) continue;
    let result;
    try {
      result = await paymentGateway.queryRefundStatus({
        method: order.payment?.method,
        providerOrderId:
          order.payment?.providerOrderId || order.payment?.transactionId,
        transactionId: order.payment?.transactionId,
        providerCreatedAt: order.payment?.providerCreatedAt || order.placedAt,
        idempotencyKey: request.refund?.idempotencyKey,
        amount: request.refund?.amount,
        originalAmount: order.totalAmount,
        reason: `Return ${request.returnCode || request._id}`,
      });
    } catch (error) {
      // The lookup failed, not the refund. Leave it for the next pass.
      stillPending += 1;
      await ReturnRequest.updateOne(
        { _id: request._id },
        {
          $set: {
            "refund.lastError": String(error?.message || error).slice(0, 500),
          },
        }
      );
      continue;
    }

    if (!result.ok || (!result.completed && !result.failed)) {
      stillPending += 1;
      continue;
    }

    if (result.failed) {
      // The gateway says this refund will never settle. Put it back in the
      // retry queue so the money is actually chased rather than written off.
      failed += 1;
      await ReturnRequest.updateOne(
        { _id: request._id, "refund.status": ReturnRequest.REFUND_STATUS.PROCESSING },
        {
          $set: {
            "refund.status": ReturnRequest.REFUND_STATUS.PENDING,
            "refund.nextRetryAt": new Date(),
            "refund.lastError": String(
              result.error || `Gateway reported refund status ${result.status}`
            ).slice(0, 500),
          },
        }
      );
      continue;
    }

    try {
      await completeReturnRefund({
        orderId: order._id,
        refundTransactionId:
          result.refundTransactionId || request.refund?.transactionId,
      });
      settled += 1;
    } catch (error) {
      // Another worker settled it first, or the record moved on. Neither is an
      // error worth surfacing; the next pass will see the final state.
      if (error?.code !== "INVALID_RETURN_TRANSITION") throw error;
    }
  }

  return { processed: candidates.length, settled, stillPending, failed };
}

module.exports = {
  RETURN_WINDOW_DAYS,
  SHOP_FAULT_WINDOW_DAYS,
  createReturnRequest,
  getReturnEligibility,
  normalizeReturnPayload,
  advanceReturnRequest,
  calculateRefundAmount,
  completeReturnRefund,
  executeReturnRefund,
  syncLinkedTicket,
  processPendingReturnRefunds,
  reconcileProcessingRefunds,
  receiveReturnRequest,
  resolveReturnRequest,
  serializeReturnRequest,
};
