const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const SupportTicket = require("../models/SupportTicket");
const SupportTicketMessage = require("../models/SupportTicketMessage");
const paymentGateway = require("./paymentGateway");
const orderService = require("./orderService");
const orderCancellationService = require("./orderCancellationService");
const shippingService = require("./shippingService");
const loyaltyService = require("./loyaltyService");
const {
  decrementStock,
  dispatchItems,
  incrementSold,
  restoreItems,
} = require("./orderInventoryService");
const {
  calculateRefundAmount,
  createReturnRequest,
  resolveReturnRequest,
} = require("./returnRequestService");
const { runInTransaction } = require("../utils/transaction");

const COMPENSATION_TYPES = Object.freeze([
  "RETURN_REFUND",
  "PARTIAL_REFUND",
  "RESHIP",
  "LOST_IN_TRANSIT_REFUND",
  "LOST_IN_TRANSIT_RESHIP",
]);
// Parcels lost in transit are handled while the order is still SHIPPED, so
// these bypass the DELIVERED precondition the other compensations require.
const LOST_IN_TRANSIT_TYPES = Object.freeze([
  "LOST_IN_TRANSIT_REFUND",
  "LOST_IN_TRANSIT_RESHIP",
]);
const OPERATION_TYPES = Object.freeze([
  "GUIDANCE",
  "APPROVE_ORDER",
  "CANCEL_ORDER",
  "CREATE_SHIPMENT",
]);
const RESOLUTION_TYPES = Object.freeze([...OPERATION_TYPES, ...COMPENSATION_TYPES]);

function serviceError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanNote(value) {
  const note = String(value || "").trim();
  if (note.length > 1000) throw serviceError(422, "Ghi chú không được vượt quá 1000 ký tự", "NOTE_TOO_LONG");
  return note;
}

function normalizeItems(order, submittedItems) {
  if (!Array.isArray(submittedItems) || !submittedItems.length) {
    throw serviceError(422, "Vui lòng chọn ít nhất một sản phẩm", "ITEMS_REQUIRED");
  }
  const byBook = new Map(order.items.map((item) => [String(item.book?._id || item.book), item]));
  const seen = new Set();
  return submittedItems.map((submitted) => {
    const bookId = String(submitted?.bookId || "");
    const ordered = byBook.get(bookId);
    const quantity = Number(submitted?.quantity);
    if (!mongoose.isValidObjectId(bookId) || seen.has(bookId) || !ordered) {
      throw serviceError(422, "Sản phẩm xử lý không hợp lệ", "INVALID_ITEM");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(ordered.quantity)) {
      throw serviceError(422, "Số lượng xử lý vượt quá số lượng đã mua", "INVALID_QUANTITY");
    }
    seen.add(bookId);
    return {
      book: ordered.book?._id || ordered.book,
      title: String(ordered.title || "Sản phẩm"),
      imageUrl: String(ordered.imageUrl || ""),
      unitPrice: Number(ordered.price) || 0,
      quantity,
    };
  });
}

// The defect is recorded on the ticket now, so there is nothing to infer: an
// ITEM_FAULT ticket always carries its itemIssue, and anything else is OTHER.
function returnReasonFor(ticket) {
  const issue = ticket?.requestDetails?.itemIssue;
  return Object.values(ReturnRequest.REASON).includes(issue)
    ? issue
    : ReturnRequest.REASON.OTHER;
}

async function addCustomerVisibleMessage(ticketId, adminId, text) {
  const message = await SupportTicketMessage.create({
    ticket: ticketId,
    sender: adminId,
    from: "admin",
    text,
  });
  await SupportTicket.updateOne(
    { _id: ticketId },
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: text.slice(0, 240),
      },
    }
  );
  await SupportTicket.updateOne(
    { _id: ticketId, firstRespondedAt: null },
    { $set: { firstRespondedAt: message.createdAt } }
  );
  return message;
}

async function initializeResolution(ticketId, adminId, type, items, note, status) {
  const ticket = await SupportTicket.findOneAndUpdate(
    {
      _id: ticketId,
      $or: [
        { resolution: null },
        { "resolution.status": { $in: ["FAILED", "REFUND_FAILED"] } },
      ],
    },
    {
      $set: {
        resolution: {
          type,
          status,
          items,
          note,
          createdBy: adminId,
          createdAt: new Date(),
          events: [{ type: "CREATED", by: adminId, note }],
        },
        status: "IN_PROGRESS",
        assignee: adminId,
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!ticket) throw serviceError(409, "Ticket đã có phương án xử lý", "RESOLUTION_EXISTS");
  return ticket;
}

async function createReturnResolution(ticket, order, adminId, items, note) {
  await initializeResolution(ticket._id, adminId, "RETURN_REFUND", items, note, "INITIATING");
  try {
    const result = await createReturnRequest({
        orderId: order._id,
        userId: ticket.user,
        // The ticket already decided whose fault this is, which sets both the
        // claim window and who pays to ship the goods back.
        faultParty: ticket.faultParty === "shop" ? "shop" : "customer",
        payload: {
          items: items.map((item) => ({ bookId: String(item.book), quantity: item.quantity })),
          reason: ticket.requestDetails?.returnReason || returnReasonFor(ticket),
          details: (note || ticket.description).slice(0, 1000),
          images: [],
        },
      });
    let request = result.request;
    if (request.status === ReturnRequest.STATUS.PENDING) {
      request = await resolveReturnRequest({
        orderId: order._id,
        adminId,
        status: ReturnRequest.STATUS.APPROVED,
        adminNote: note || "BookShop đã tiếp nhận đổi trả từ yêu cầu hỗ trợ. Vui lòng đóng gói sản phẩm để hoàn trả.",
      });
    }
    await SupportTicket.updateOne(
      { _id: ticket._id },
      {
        $set: { "resolution.status": "RETURNING", "resolution.returnRequest": request._id },
        $push: { "resolution.events": { type: "RETURN_APPROVED", by: adminId, note: request.returnCode } },
      }
    );
    const feeNote =
      request.returnShippingPaidBy === "shop"
        ? " Vì lỗi thuộc về BookShop, chúng tôi chịu phí vận chuyển trả hàng."
        : " Phí vận chuyển trả hàng do bạn thanh toán theo chính sách đổi trả.";
    const message = await addCustomerVisibleMessage(
      ticket._id,
      adminId,
      `BookShop đã tạo yêu cầu đổi trả ${request.returnCode || ""} cho đơn ${order.orderCode}. Vui lòng làm theo hướng dẫn đổi trả trong chi tiết đơn hàng.${feeNote}`
    );
    return { ticket: await SupportTicket.findById(ticket._id), message };
  } catch (error) {
    await SupportTicket.updateOne(
      { _id: ticket._id },
      { $set: { "resolution.status": "FAILED" }, $push: { "resolution.events": { type: "FAILED", by: adminId, note: String(error.message).slice(0, 500) } } }
    );
    throw error;
  }
}

async function reserveRefundAndResolution(
  ticket,
  order,
  adminId,
  items,
  note,
  amount,
  type = "PARTIAL_REFUND"
) {
  return runInTransaction(async (session) => {
    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        $expr: {
          $lte: [
            {
              $add: [
                { $ifNull: ["$supportCompensation.refundedAmount", 0] },
                { $ifNull: ["$supportCompensation.reservedRefundAmount", 0] },
                amount,
              ],
            },
            "$totalAmount",
          ],
        },
      },
      { $inc: { "supportCompensation.reservedRefundAmount": amount } },
      { returnDocument: "after", session }
    );
    if (!updatedOrder) throw serviceError(409, "Khoản hoàn vượt quá số tiền còn có thể hoàn của đơn", "REFUND_LIMIT_EXCEEDED");
    const updatedTicket = await SupportTicket.findOneAndUpdate(
      {
        _id: ticket._id,
        $or: [
          { resolution: null },
          { "resolution.status": { $in: ["FAILED", "REFUND_FAILED"] } },
        ],
      },
      {
        $set: {
          resolution: {
            type,
            status: order.payment?.method === Order.PAYMENT_METHOD.COD ? "REFUND_MANUAL_REQUIRED" : "REFUND_PENDING",
            items,
            amount,
            note,
            refund: {
              // A definitive gateway rejection releases the reservation and
              // may be retried by an operator. Each such attempt needs a new
              // provider idempotency key; unknown/in-flight attempts are never
              // exposed as retryable and keep their original key.
              idempotencyKey: `support-refund:${ticket._id}:${crypto.randomUUID()}`,
              businessType: "SUPPORT",
              sourceId: String(ticket._id),
              amount,
              paymentMethod: order.payment?.method,
              originalPaymentTransactionId: String(
                order.payment?.transactionId || ""
              ),
              originalProviderOrderId: String(
                order.payment?.providerOrderId || ""
              ),
            },
            createdBy: adminId,
            createdAt: new Date(),
            events: [{ type: "REFUND_CREATED", by: adminId, note }],
          },
          status: "IN_PROGRESS",
          assignee: adminId,
        },
      },
      { returnDocument: "after", runValidators: true, session }
    ).select("+resolution.refund.idempotencyKey");
    if (!updatedTicket) throw serviceError(409, "Ticket đã có phương án xử lý", "RESOLUTION_EXISTS");
    return updatedTicket;
  });
}

async function releaseRefundReservation(orderId, amount) {
  await Order.updateOne(
    { _id: orderId, "supportCompensation.reservedRefundAmount": { $gte: amount } },
    { $inc: { "supportCompensation.reservedRefundAmount": -amount } }
  );
}

async function assertLineEntitlements(order, ticketId, items) {
  const [returns, tickets] = await Promise.all([
    ReturnRequest.find({
      order: order._id,
      status: { $ne: ReturnRequest.STATUS.REJECTED },
    }).select("items.book items.quantity").lean(),
    SupportTicket.find({
      _id: { $ne: ticketId },
      order: order._id,
      "resolution.type": {
        $in: COMPENSATION_TYPES.filter((type) => type !== "RETURN_REFUND"),
      },
      "resolution.status": { $nin: ["FAILED", "REFUND_FAILED", "CANCELLED"] },
    }).select("resolution.items.book resolution.items.quantity").lean(),
  ]);
  const consumed = new Map();
  const add = (entry) => {
    const key = String(entry.book?._id || entry.book || "");
    consumed.set(key, (consumed.get(key) || 0) + (Number(entry.quantity) || 0));
  };
  returns.flatMap((request) => request.items || []).forEach(add);
  tickets.flatMap((entry) => entry.resolution?.items || []).forEach(add);
  const ordered = new Map(
    order.items.map((item) => [
      String(item.book?._id || item.book),
      Number(item.quantity) || 0,
    ])
  );
  if (items.some((item) =>
    (consumed.get(String(item.book)) || 0) + Number(item.quantity) >
      (ordered.get(String(item.book)) || 0)
  )) {
    throw serviceError(
      409,
      "Số lượng bồi hoàn bị trùng hoặc vượt quyền lợi còn lại của sản phẩm",
      "ITEM_COMPENSATION_LIMIT_EXCEEDED"
    );
  }
}

async function revokeSupportRefundPoints(ticket, order, session) {
  // PARTIAL_REFUND is priced from the affected goods and therefore reverses
  // the matching share of earned points. A lost-in-transit refund never earned
  // delivery points, while reships/guidance do not return money.
  if (ticket.resolution?.type !== "PARTIAL_REFUND") return null;
  return loyaltyService.revokeOrderPointsPartial(
    order,
    {
      refundedGoodsAmount: ticket.resolution.amount,
      returnId: `support-${ticket._id}`,
      returnCode: ticket.ticketCode || "",
    },
    session
  );
}

async function closeLostOrderWhenFullyRefunded(ticket, order, session) {
  if (
    ticket.resolution?.type !== "LOST_IN_TRANSIT_REFUND" ||
    Number(ticket.resolution.amount) !== Number(order.totalAmount)
  ) {
    return null;
  }
  return orderService.completeLostInTransitRefund(order._id, session);
}

async function executeOnlineRefund(ticket, order, adminId) {
  const amount = ticket.resolution.amount;
  const idempotencyKey = ticket.resolution.refund.idempotencyKey;
  let result;
  try {
    result = await paymentGateway.requestRefund({
      method: order.payment.method,
      providerOrderId: order.payment.providerOrderId || order.payment.transactionId,
      transactionId: order.payment.transactionId,
      providerCreatedAt: order.payment.providerCreatedAt || order.placedAt,
      amount,
      originalAmount: order.totalAmount,
      reason: `Support ticket ${ticket.ticketCode}`,
      idempotencyKey,
      initiatedBy: `admin:${adminId}`,
    });
  } catch (error) {
    result = { ok: false, unknown: true, error: error.message };
  }
  if (!result.ok || !String(result.refundTransactionId || "").trim()) {
    const failureMessage = result.ok
      ? "Cổng thanh toán không trả về mã giao dịch hoàn tiền"
      : result.error || "Không thể hoàn tiền";
    if (result.unknown || result.ok) {
      await SupportTicket.updateOne(
        { _id: ticket._id, "resolution.status": "REFUND_PENDING" },
        {
          $set: {
            "resolution.status": "REFUND_PROCESSING",
            "resolution.refund.lastError": String(failureMessage).slice(0, 500),
          },
          $push: {
            "resolution.events": {
              type: "REFUND_PENDING",
              by: adminId,
              note: String(failureMessage).slice(0, 500),
            },
          },
        }
      );
      return addCustomerVisibleMessage(
        ticket._id,
        adminId,
        `BookShop đã gửi yêu cầu hoàn ${amount.toLocaleString("vi-VN")}đ. Kết quả từ cổng thanh toán chưa xác định và đang được đối soát; hạn mức hoàn vẫn được giữ.`
      );
    }
    await releaseRefundReservation(order._id, amount);
    await SupportTicket.updateOne(
      { _id: ticket._id },
      {
        $set: { "resolution.status": "REFUND_FAILED", "resolution.refund.lastError": String(failureMessage).slice(0, 500) },
        $push: { "resolution.events": { type: "REFUND_FAILED", by: adminId, note: String(failureMessage).slice(0, 500) } },
      }
    );
    throw serviceError(502, failureMessage, "REFUND_FAILED");
  }
  // `ok` is only the gateway's acknowledgement; `completed` is settlement.
  // VNPay answers ok/not-completed while the refund is still in flight, so
  // resolving the ticket here would tell the customer the money was already
  // back with them.
  const settled = Boolean(result.completed);
  const settledAt = new Date();
  await runInTransaction(async (session) => {
    if (settled) {
      const orderUpdate = await Order.updateOne(
        { _id: order._id, "supportCompensation.reservedRefundAmount": { $gte: amount } },
        { $inc: { "supportCompensation.reservedRefundAmount": -amount, "supportCompensation.refundedAmount": amount } },
        { session }
      );
      if (orderUpdate.modifiedCount !== 1) throw serviceError(409, "Không thể quyết toán hạn mức hoàn tiền", "REFUND_RESERVATION_MISSING");
      await revokeSupportRefundPoints(ticket, order, session);
      await closeLostOrderWhenFullyRefunded(ticket, order, session);
    }
    // While unsettled the reservation stays held: the money is committed to
    // this refund even though it has not landed, so releasing it would let a
    // second refund be approved against the same headroom.
    await SupportTicket.updateOne(
      { _id: ticket._id, "resolution.status": "REFUND_PENDING" },
      {
        $set: settled
          ? {
              "resolution.status": "REFUND_COMPLETED",
              "resolution.refund.transactionId": String(result.refundTransactionId || ""),
              "resolution.refund.completedAt": settledAt,
              "resolution.completedAt": settledAt,
              status: "RESOLVED",
              resolvedAt: settledAt,
            }
          : {
              "resolution.status": "REFUND_PROCESSING",
              "resolution.refund.transactionId": String(result.refundTransactionId || ""),
            },
        $push: {
          "resolution.events": {
            type: settled ? "REFUND_COMPLETED" : "REFUND_PENDING",
            by: adminId,
            note: String(result.refundTransactionId || ""),
          },
        },
      },
      { session }
    );
  });
  return addCustomerVisibleMessage(
    ticket._id,
    adminId,
    settled
      ? `BookShop đã hoàn ${amount.toLocaleString("vi-VN")}đ cho đơn ${order.orderCode}.`
      : `BookShop đã gửi yêu cầu hoàn ${amount.toLocaleString("vi-VN")}đ cho đơn ${order.orderCode}. Cổng thanh toán đang xử lý, số tiền sẽ về tài khoản của bạn sau khi hoàn tất.`
  );
}

async function createRefundResolution(ticket, order, adminId, items, note) {
  if (order.status !== Order.STATUS.DELIVERED || order.payment?.status !== Order.PAYMENT_STATUS.PAID) {
    throw serviceError(422, "Chỉ đơn đã giao và đã thanh toán mới có thể hoàn tiền theo sản phẩm", "ORDER_NOT_REFUNDABLE");
  }
  const amount = calculateRefundAmount(order, items);
  if (!amount) throw serviceError(422, "Số tiền hoàn không hợp lệ", "INVALID_REFUND_AMOUNT");
  const resolutionTicket = await reserveRefundAndResolution(ticket, order, adminId, items, note, amount);
  const message = order.payment.method === Order.PAYMENT_METHOD.COD
    ? await addCustomerVisibleMessage(ticket._id, adminId, `BookShop đã duyệt hoàn ${amount.toLocaleString("vi-VN")}đ. Khoản hoàn COD đang chờ nhân viên ghi nhận giao dịch.`)
    : await executeOnlineRefund(resolutionTicket, order, adminId);
  return { ticket: await SupportTicket.findById(ticket._id), message };
}

// ── Lost / destroyed in transit ────────────────────────────────────────────
// The parcel was handed to the carrier but will never arrive. The order stays
// un-delivered, so the customer is made whole either by refunding what they
// paid or by shipping the goods again.

function assertLostInTransitAllowed(order) {
  if (order.status !== Order.STATUS.SHIPPED) {
    throw serviceError(
      422,
      "Chỉ đơn đang vận chuyển mới có thể xử lý thất lạc",
      "ORDER_NOT_IN_TRANSIT"
    );
  }
}

async function createLostRefundResolution(ticket, order, adminId, items, note) {
  assertLostInTransitAllowed(order);
  if (order.payment?.status !== Order.PAYMENT_STATUS.PAID) {
    throw serviceError(
      422,
      "Đơn chưa thanh toán thì không có khoản nào để hoàn, vui lòng hủy đơn thay vì hoàn tiền",
      "ORDER_NOT_PAID"
    );
  }
  const amount = calculateRefundAmount(order, items);
  if (!amount) throw serviceError(422, "Số tiền hoàn không hợp lệ", "INVALID_REFUND_AMOUNT");

  const resolutionTicket = await reserveRefundAndResolution(
    ticket,
    order,
    adminId,
    items,
    note,
    amount,
    "LOST_IN_TRANSIT_REFUND"
  );
  const message =
    order.payment.method === Order.PAYMENT_METHOD.COD
      ? await addCustomerVisibleMessage(
          ticket._id,
          adminId,
          `BookShop xác nhận đơn ${order.orderCode} đã thất lạc trong quá trình vận chuyển và duyệt hoàn ${amount.toLocaleString("vi-VN")}đ. Khoản hoàn đang chờ nhân viên ghi nhận giao dịch.`
        )
      : await executeOnlineRefund(resolutionTicket, order, adminId);
  return { ticket: await SupportTicket.findById(ticket._id), message };
}

async function createLostReshipResolution(ticket, order, adminId, items, note) {
  assertLostInTransitAllowed(order);
  const codAmount = shippingService.calculateSupportShipmentCodAmount(
    { resolution: { type: "LOST_IN_TRANSIT_RESHIP" } },
    order
  );
  const updatedTicket = await runInTransaction(async (session) => {
    for (const item of items) {
      const reserved = await decrementStock(item.book, item.quantity, session, {
        orderId: order._id,
        orderCode: order.orderCode,
        reason: `Giữ hàng giao lại theo ticket ${ticket.ticketCode}`,
        performedBy: adminId,
      });
      if (!reserved) {
        throw serviceError(409, `Không đủ tồn kho để giao lại “${item.title}”`, "INSUFFICIENT_STOCK");
      }
    }
    const next = await SupportTicket.findOneAndUpdate(
      {
        _id: ticket._id,
        $or: [{ resolution: null }, { "resolution.status": { $in: ["FAILED", "CANCELLED"] } }],
      },
      {
        $set: {
          resolution: {
            type: "LOST_IN_TRANSIT_RESHIP",
            status: "PREPARING",
            items,
            note,
            shipment: { codAmount },
            createdBy: adminId,
            createdAt: new Date(),
            events: [{ type: "RESHIP_CREATED", by: adminId, note }],
          },
          status: "IN_PROGRESS",
          assignee: adminId,
        },
      },
      { returnDocument: "after", runValidators: true, session }
    );
    if (!next) throw serviceError(409, "Ticket đã có phương án xử lý", "RESOLUTION_EXISTS");
    return next;
  });
  const message = await addCustomerVisibleMessage(
    ticket._id,
    adminId,
    `BookShop xác nhận đơn ${order.orderCode} đã thất lạc trong quá trình vận chuyển và sẽ giao lại cho bạn.${
      codAmount > 0
        ? ` Vận đơn mới sẽ thu hộ ${codAmount.toLocaleString("vi-VN")}đ còn phải thanh toán.`
        : " Đây là kiện giao bù miễn phí vì đơn đã được thanh toán."
    } Chúng tôi sẽ cập nhật mã vận đơn mới khi bàn giao cho đơn vị vận chuyển.`
  );
  return { ticket: updatedTicket, message };
}

async function createReshipResolution(ticket, order, adminId, items, note) {
  if (order.status !== Order.STATUS.DELIVERED) {
    throw serviceError(422, "Chỉ đơn đã giao mới có thể tạo giao bù/giao lại", "ORDER_NOT_DELIVERED");
  }
  const updatedTicket = await runInTransaction(async (session) => {
    for (const item of items) {
      const reserved = await decrementStock(item.book, item.quantity, session, {
        orderId: order._id,
        orderCode: order.orderCode,
        reason: `Giữ hàng giao bù theo ticket ${ticket.ticketCode}`,
        performedBy: adminId,
      });
      if (!reserved) throw serviceError(409, `Không đủ tồn kho để giao bù “${item.title}”`, "INSUFFICIENT_STOCK");
    }
    const next = await SupportTicket.findOneAndUpdate(
      {
        _id: ticket._id,
        $or: [{ resolution: null }, { "resolution.status": { $in: ["FAILED", "CANCELLED"] } }],
      },
      {
        $set: {
          resolution: {
            type: "RESHIP",
            status: "PREPARING",
            items,
            note,
            createdBy: adminId,
            createdAt: new Date(),
            events: [{ type: "RESHIP_CREATED", by: adminId, note }],
          },
          status: "IN_PROGRESS",
          assignee: adminId,
        },
      },
      { returnDocument: "after", runValidators: true, session }
    );
    if (!next) throw serviceError(409, "Ticket đã có phương án xử lý", "RESOLUTION_EXISTS");
    return next;
  });
  const message = await addCustomerVisibleMessage(ticket._id, adminId, `BookShop đã tạo phiếu giao bù/giao lại cho đơn ${order.orderCode}. Chúng tôi sẽ cập nhật mã vận đơn khi bàn giao cho đơn vị vận chuyển.`);
  return { ticket: updatedTicket, message };
}

function assertOperationAllowed(type, order) {
  const status = order.status;
  const isCod = order.payment?.method === Order.PAYMENT_METHOD.COD;
  const allowed = {
    GUIDANCE: true,
    APPROVE_ORDER:
      (status === Order.STATUS.PENDING && isCod) || status === Order.STATUS.PAID,
    CANCEL_ORDER: [
      Order.STATUS.PENDING,
      Order.STATUS.PAID,
      Order.STATUS.PROCESSING,
    ].includes(status),
    CREATE_SHIPMENT: status === Order.STATUS.PROCESSING,
  }[type];
  if (!allowed) {
    throw serviceError(
      422,
      `Thao tác ${type} không áp dụng khi đơn ở trạng thái ${status}`,
      "ORDER_ACTION_NOT_ALLOWED"
    );
  }
}

async function createOperationalResolution(ticket, order, adminId, type, note) {
  assertOperationAllowed(type, order);
  if (type === "GUIDANCE" && note.length < 3) {
    throw serviceError(
      422,
      "Vui lòng nhập nội dung hướng dẫn khách hàng",
      "GUIDANCE_REQUIRED"
    );
  }
  await initializeResolution(
    ticket._id,
    adminId,
    type,
    [],
    note,
    "ACTION_PENDING"
  );
  try {
    let customerMessage = note;
    if (type === "APPROVE_ORDER") {
      await orderService.adminApproveOrder(order._id, adminId);
      customerMessage = `Đơn ${order.orderCode} đã được xác nhận và chuyển sang chuẩn bị hàng.${note ? ` ${note}` : ""}`;
    } else if (type === "CANCEL_ORDER") {
      await orderCancellationService.requestAdminCancellation(
        order._id,
        adminId,
        note || `Hủy đơn theo ticket ${ticket.ticketCode}`
      );
      customerMessage = `BookShop đã tiếp nhận hủy đơn ${order.orderCode}. Nếu đơn đã thanh toán, tiền sẽ được hoàn theo phương thức thanh toán ban đầu.${note ? ` ${note}` : ""}`;
    } else if (type === "CREATE_SHIPMENT") {
      const result = await shippingService.createGhnShipment(order._id);
      customerMessage = `Đã tạo vận đơn ${result.order.trackingNumber} qua ${result.order.carrier} cho đơn ${order.orderCode}.${note ? ` ${note}` : ""}`;
    }
    const completedAt = new Date();
    const updatedTicket = await SupportTicket.findOneAndUpdate(
      { _id: ticket._id, "resolution.status": "ACTION_PENDING" },
      {
        $set: {
          "resolution.status": "COMPLETED",
          "resolution.completedAt": completedAt,
          status: "RESOLVED",
          resolvedAt: completedAt,
        },
        $push: {
          "resolution.events": { type: "COMPLETED", by: adminId, note },
        },
      },
      { returnDocument: "after" }
    );
    const message = await addCustomerVisibleMessage(
      ticket._id,
      adminId,
      customerMessage
    );
    return { ticket: updatedTicket, message };
  } catch (error) {
    await SupportTicket.updateOne(
      { _id: ticket._id, "resolution.status": "ACTION_PENDING" },
      {
        $set: { "resolution.status": "FAILED" },
        $push: {
          "resolution.events": {
            type: "FAILED",
            by: adminId,
            note: String(error.message || error).slice(0, 500),
          },
        },
      }
    );
    throw error;
  }
}

async function createResolution({ ticketId, adminId, payload }) {
  const type = String(payload?.type || "").toUpperCase();
  if (!RESOLUTION_TYPES.includes(type)) throw serviceError(422, "Phương án xử lý không hợp lệ", "INVALID_RESOLUTION_TYPE");
  const ticket = await SupportTicket.findById(ticketId).select("+resolution.refund.idempotencyKey");
  if (!ticket) throw serviceError(404, "Không tìm thấy ticket", "TICKET_NOT_FOUND");
  const order = await Order.findById(ticket.order).select("+supportCompensation.reservedRefundAmount");
  if (!order) throw serviceError(404, "Không tìm thấy đơn hàng", "ORDER_NOT_FOUND");
  const note = cleanNote(payload.note);
  if (OPERATION_TYPES.includes(type)) {
    return createOperationalResolution(ticket, order, adminId, type, note);
  }
  const items = normalizeItems(order, payload.items);
  await assertLineEntitlements(order, ticket._id, items);
  if (type === "RETURN_REFUND") return createReturnResolution(ticket, order, adminId, items, note);
  if (type === "PARTIAL_REFUND") return createRefundResolution(ticket, order, adminId, items, note);
  if (type === "LOST_IN_TRANSIT_REFUND") return createLostRefundResolution(ticket, order, adminId, items, note);
  if (type === "LOST_IN_TRANSIT_RESHIP") return createLostReshipResolution(ticket, order, adminId, items, note);
  return createReshipResolution(ticket, order, adminId, items, note);
}

async function completeManualRefund({ ticketId, adminId, transactionId }) {
  const reference = String(transactionId || "").trim();
  if (reference.length < 3 || reference.length > 250) throw serviceError(422, "Vui lòng nhập mã giao dịch hoàn tiền", "REFUND_REFERENCE_REQUIRED");
  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    "resolution.type": { $in: ["PARTIAL_REFUND", "LOST_IN_TRANSIT_REFUND"] },
    "resolution.status": "REFUND_MANUAL_REQUIRED",
  });
  if (!ticket) throw serviceError(409, "Khoản hoàn không ở trạng thái chờ ghi nhận", "INVALID_REFUND_STATE");
  const completedAt = new Date();
  await runInTransaction(async (session) => {
    const refundedOrder = await Order.findOneAndUpdate(
      { _id: ticket.order, "supportCompensation.reservedRefundAmount": { $gte: ticket.resolution.amount } },
      { $inc: { "supportCompensation.reservedRefundAmount": -ticket.resolution.amount, "supportCompensation.refundedAmount": ticket.resolution.amount } },
      { returnDocument: "after", session }
    );
    if (!refundedOrder) throw serviceError(409, "Không tìm thấy hạn mức hoàn tiền đang giữ", "REFUND_RESERVATION_MISSING");
    await revokeSupportRefundPoints(ticket, refundedOrder, session);
    await closeLostOrderWhenFullyRefunded(ticket, refundedOrder, session);
    await SupportTicket.updateOne(
      { _id: ticket._id, "resolution.status": "REFUND_MANUAL_REQUIRED" },
      {
        $set: {
          "resolution.status": "REFUND_COMPLETED",
          "resolution.refund.transactionId": reference,
          "resolution.refund.completedAt": completedAt,
          "resolution.completedAt": completedAt,
          status: "RESOLVED",
          resolvedAt: completedAt,
        },
        $push: { "resolution.events": { type: "REFUND_COMPLETED", by: adminId, note: reference } },
      },
      { session }
    );
  });
  const message = await addCustomerVisibleMessage(ticket._id, adminId, `BookShop đã hoàn ${ticket.resolution.amount.toLocaleString("vi-VN")}đ. Mã giao dịch: ${reference}.`);
  return { ticket: await SupportTicket.findById(ticket._id), message };
}

/**
 * Settle a support refund the gateway has confirmed, mirroring the manual path
 * above. Separated out so both the reconciliation pass and a webhook can close
 * the same ticket without duplicating the money movement.
 *
 * Idempotent through the status guards: the reservation is only converted while
 * the ticket is still REFUND_PROCESSING, so a repeat cannot double-count.
 */
async function settleProcessingRefund(ticket, refundTransactionId) {
  const amount = Number(ticket.resolution?.amount) || 0;
  const reference = String(refundTransactionId || "").trim();
  const refund = ticket.resolution?.refund;
  if (
    !reference ||
    !refund?.transactionId ||
    String(refund.transactionId) !== reference
  ) {
    throw serviceError(
      409,
      "Mã giao dịch hoàn tiền không khớp với hồ sơ hỗ trợ",
      "REFUND_REFERENCE_MISMATCH"
    );
  }
  const order = await Order.findById(ticket.order);
  if (!order) {
    throw serviceError(404, "Không tìm thấy đơn hàng", "ORDER_NOT_FOUND");
  }
  if (
    refund.businessType !== "SUPPORT" ||
    String(refund.sourceId || "") !== String(ticket._id) ||
    Number(refund.amount) !== amount ||
    refund.paymentMethod !== order.payment?.method ||
    String(refund.originalPaymentTransactionId || "") !==
      String(order.payment?.transactionId || "") ||
    String(refund.originalProviderOrderId || "") !==
      String(order.payment?.providerOrderId || "")
  ) {
    throw serviceError(
      409,
      "Thông tin định danh khoản hoàn hỗ trợ không khớp",
      "REFUND_IDENTITY_MISMATCH"
    );
  }
  if (
    ticket.resolution?.status === "REFUND_COMPLETED" &&
    refund.completedAt
  ) {
    return false;
  }
  const completedAt = new Date();
  let changed = false;
  await runInTransaction(async (session) => {
    const claimed = await SupportTicket.updateOne(
      {
        _id: ticket._id,
        "resolution.status": "REFUND_PROCESSING",
        "resolution.refund.transactionId": refund.transactionId
          ? reference
          : { $in: ["", null] },
        "resolution.refund.businessType": "SUPPORT",
        "resolution.refund.sourceId": String(ticket._id),
        "resolution.refund.amount": amount,
      },
      {
        $set: {
          "resolution.status": "REFUND_COMPLETED",
          "resolution.refund.transactionId": reference,
          "resolution.refund.completedAt": completedAt,
          "resolution.completedAt": completedAt,
          status: "RESOLVED",
          resolvedAt: completedAt,
        },
        $push: {
          "resolution.events": {
            type: "REFUND_COMPLETED",
            by: null,
            note: reference,
          },
        },
      },
      { session }
    );
    if (claimed.modifiedCount !== 1) return;
    changed = true;
    // The headroom was held while the refund was in flight; now that the money
    // is gone it becomes spent rather than reserved.
    const orderUpdate = await Order.updateOne(
      {
        _id: ticket.order,
        "payment.method": refund.paymentMethod,
        "payment.transactionId": refund.originalPaymentTransactionId,
        "payment.providerOrderId": refund.originalProviderOrderId,
        "supportCompensation.reservedRefundAmount": { $gte: amount },
      },
      {
        $inc: {
          "supportCompensation.reservedRefundAmount": -amount,
          "supportCompensation.refundedAmount": amount,
        },
      },
      { session }
    );
    if (orderUpdate.modifiedCount !== 1) {
      throw serviceError(
        409,
        "Không tìm thấy hạn mức hoàn tiền đang giữ",
        "REFUND_RESERVATION_MISSING"
      );
    }
    await revokeSupportRefundPoints(ticket, order, session);
    await closeLostOrderWhenFullyRefunded(ticket, order, session);
  });
  if (changed) {
    await addCustomerVisibleMessage(
      ticket._id,
      null,
      `BookShop đã hoàn ${amount.toLocaleString("vi-VN")}đ cho bạn. Mã giao dịch: ${reference}.`
    ).catch(() => null);
  }
  return changed;
}

/**
 * Chase up support refunds the gateway accepted but has not settled.
 *
 * The ticket counterpart of `reconcileProcessingRefunds` in the return service,
 * and just as conservative: a lookup that errors leaves the ticket waiting,
 * because a failed question is not a failed refund.
 */
async function reconcileProcessingRefunds({ limit = 20 } = {}) {
  const tickets = await SupportTicket.find({
    "resolution.status": "REFUND_PROCESSING",
  })
    .select("+resolution.refund.idempotencyKey")
    .limit(limit);

  let settled = 0;
  let stillPending = 0;
  let failed = 0;

  for (const ticket of tickets) {
    const order = await Order.findById(ticket.order);
    if (!order) continue;
    let result;
    try {
      result = await paymentGateway.queryRefundStatus({
        method: order.payment?.method,
        providerOrderId:
          order.payment?.providerOrderId || order.payment?.transactionId,
        transactionId: order.payment?.transactionId,
        providerCreatedAt: order.payment?.providerCreatedAt || order.placedAt,
        idempotencyKey: ticket.resolution?.refund?.idempotencyKey,
        amount: ticket.resolution?.amount,
        originalAmount: order.totalAmount,
        reason: `Support ticket ${ticket.ticketCode}`,
      });
    } catch {
      stillPending += 1;
      continue;
    }

    if (!result.ok || (!result.completed && !result.failed)) {
      stillPending += 1;
      continue;
    }

    if (result.failed) {
      failed += 1;
      // Release the held headroom: this refund is not happening, so the money
      // must not stay blocked against the order's cap.
      await releaseRefundReservation(order._id, ticket.resolution.amount);
      await SupportTicket.updateOne(
        { _id: ticket._id, "resolution.status": "REFUND_PROCESSING" },
        {
          $set: {
            "resolution.status": "REFUND_FAILED",
            "resolution.refund.lastError": String(
              result.error || `Gateway reported refund status ${result.status}`
            ).slice(0, 500),
          },
          $push: {
            "resolution.events": {
              type: "REFUND_FAILED",
              by: null,
              note: String(result.status || "").slice(0, 500),
            },
          },
        }
      );
      continue;
    }

    if (await settleProcessingRefund(ticket, result.refundTransactionId)) {
      settled += 1;
    }
  }

  return { processed: tickets.length, settled, stillPending, failed };
}

async function updateReship({ ticketId, adminId, payload }) {
  const nextStatus = String(payload?.status || "").toUpperCase();
  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    "resolution.type": { $in: ["RESHIP", "LOST_IN_TRANSIT_RESHIP"] },
  });
  if (!ticket) throw serviceError(404, "Không tìm thấy phiếu giao bù", "RESHIP_NOT_FOUND");
  const current = ticket.resolution.status;
  if (nextStatus === "SHIPPED" && current === "PREPARING") {
    const provider = String(payload.provider || "").trim().toLowerCase();
    if (provider !== "ghn") {
      throw serviceError(422, "Đơn vị vận chuyển không hợp lệ", "INVALID_SHIPPING_PROVIDER");
    }
    const order = await Order.findById(ticket.order);
    const shipment = await shippingService.createSupportShipment({ ticket, order });
    const shippedTicket = await runInTransaction(async (session) => {
      const currentTicket = await SupportTicket.findOne({
        _id: ticket._id,
        "resolution.status": "PREPARING",
      }).session(session);
      if (!currentTicket) {
        throw serviceError(409, "Phiếu giao bù đã được xử lý", "INVALID_RESHIP_TRANSITION");
      }
      await dispatchItems(currentTicket.resolution.items, session, {
        orderId: order._id,
        orderCode: order.orderCode,
        reason: `Xuất giao bù theo ticket ${currentTicket.ticketCode}`,
        performedBy: adminId,
      });
      currentTicket.resolution.status = "SHIPPED";
      Object.assign(currentTicket.resolution.shipment, {
        provider: shipment.provider,
        environment: shipment.environment,
        carrier: shipment.carrier,
        clientOrderCode: shipment.clientOrderCode,
        trackingNumber: shipment.trackingNumber,
        providerStatus: shipment.providerStatus,
        codAmount: Number(shipment.codAmount) || 0,
        estimatedDelivery: shipment.estimatedDelivery,
        shippedAt: new Date(),
      });
      currentTicket.resolution.events.push({
        type: "SHIPPED",
        by: adminId,
        note: String(payload.note || "").slice(0, 500),
      });
      await currentTicket.save({ session });
      return currentTicket;
    });
    const deliveryDate = shippedTicket.resolution.shipment.estimatedDelivery
      ? new Date(shippedTicket.resolution.shipment.estimatedDelivery).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
      : null;
    const message = await addCustomerVisibleMessage(
      ticket._id,
      adminId,
      `Đơn giao bù đã được gửi qua ${shippedTicket.resolution.shipment.carrier}, mã vận đơn ${shippedTicket.resolution.shipment.trackingNumber}${deliveryDate ? `, dự kiến giao ngày ${deliveryDate}` : ""}.`
    );
    return { ticket: shippedTicket, message };
  } else if (nextStatus === "DELIVERED" && current === "SHIPPED") {
    // A replacement for a lost parcel fulfils the original order, which would
    // otherwise sit in SHIPPED forever.
    //
    if (ticket.resolution.type === "LOST_IN_TRANSIT_RESHIP") {
      const deliveredTicket = await runInTransaction(async (session) => {
        const currentTicket = await SupportTicket.findOne({
          _id: ticket._id,
          "resolution.status": "SHIPPED",
        }).session(session);
        if (!currentTicket) {
          throw serviceError(
            409,
            "Phiếu giao bù đã được xử lý",
            "INVALID_RESHIP_TRANSITION"
          );
        }
        const order = await Order.findById(currentTicket.order)
          .select("+pointsEarnedAt")
          .session(session);
        if (!order) {
          throw serviceError(404, "Không tìm thấy đơn hàng", "ORDER_NOT_FOUND");
        }
        const amountDue = shippingService.calculateSupportShipmentCodAmount(
          currentTicket,
          order
        );
        const shipmentCodAmount = Number(
          currentTicket.resolution.shipment?.codAmount
        ) || 0;
        if (shipmentCodAmount !== amountDue) {
          throw serviceError(
            409,
            "Vận đơn giao lại không thu đúng số tiền COD còn phải thu",
            "RESHIP_COD_NOT_COLLECTED"
          );
        }
        if (!order.canTransitionTo(Order.STATUS.DELIVERED)) {
          throw serviceError(
            409,
            "Đơn gốc không thể xác nhận giao lại ở trạng thái hiện tại",
            "INVALID_ORDER_TRANSITION"
          );
        }
        order.applyTransition(Order.STATUS.DELIVERED, {
          by: `admin:${adminId}`,
          reason: `Giao lại thành công theo ticket ${currentTicket.ticketCode}`,
        });
        for (const item of order.items) {
          await incrementSold(item.book, item.quantity, session);
        }
        await loyaltyService.earnForOrder(order, session, {
          performedBy: mongoose.isValidObjectId(adminId) ? adminId : null,
        });
        await order.save({ session });

        const deliveredAt = new Date();
        currentTicket.resolution.status = "DELIVERED";
        currentTicket.resolution.shipment.deliveredAt = deliveredAt;
        currentTicket.resolution.completedAt = deliveredAt;
        currentTicket.status = "RESOLVED";
        currentTicket.resolvedAt = deliveredAt;
        currentTicket.resolution.events.push({
          type: "DELIVERED",
          by: adminId,
          note: String(payload.note || "").slice(0, 500),
        });
        await currentTicket.save({ session });
        return currentTicket;
      });
      const message = await addCustomerVisibleMessage(
        ticket._id,
        adminId,
        "Đơn giao bù đã được xác nhận giao thành công."
      );
      return { ticket: deliveredTicket, message };
    }
    ticket.resolution.status = "DELIVERED";
    ticket.resolution.shipment.deliveredAt = new Date();
    ticket.resolution.completedAt = new Date();
    ticket.status = "RESOLVED";
    ticket.resolvedAt = new Date();
  } else if (nextStatus === "CANCELLED" && current === "PREPARING") {
    const cancelledAt = new Date();
    await runInTransaction(async (session) => {
      const claimed = await SupportTicket.findOneAndUpdate(
        { _id: ticket._id, "resolution.status": "PREPARING" },
        {
          $set: { "resolution.status": "CANCELLED", "resolution.completedAt": cancelledAt },
          $push: { "resolution.events": { type: "CANCELLED", by: adminId, note: String(payload.note || "").slice(0, 500) } },
        },
        { returnDocument: "after", session }
      );
      if (!claimed) throw serviceError(409, "Phiếu giao bù đã được xử lý", "INVALID_RESHIP_TRANSITION");
      const order = await Order.findById(ticket.order).session(session);
      await restoreItems(ticket.resolution.items, session, {
        orderId: order?._id || ticket.order,
        orderCode: order?.orderCode || "",
        reason: `Hủy giao bù theo ticket ${ticket.ticketCode}`,
        performedBy: adminId,
      });
    });
    const message = await addCustomerVisibleMessage(ticket._id, adminId, "Phiếu giao bù đã được hủy. BookShop sẽ tiếp tục trao đổi phương án khác với bạn.");
    return { ticket: await SupportTicket.findById(ticket._id), message };
  } else {
    throw serviceError(409, "Không thể chuyển trạng thái phiếu giao bù", "INVALID_RESHIP_TRANSITION");
  }
  ticket.resolution.events.push({ type: nextStatus, by: adminId, note: String(payload.note || "").slice(0, 500) });
  await ticket.save();
  const deliveryDate = ticket.resolution.shipment.estimatedDelivery
    ? new Date(ticket.resolution.shipment.estimatedDelivery).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : null;
  const texts = {
    SHIPPED: `Đơn giao bù đã được gửi qua ${ticket.resolution.shipment.carrier}, mã vận đơn ${ticket.resolution.shipment.trackingNumber}${deliveryDate ? `, dự kiến giao ngày ${deliveryDate}` : ""}.`,
    DELIVERED: "Đơn giao bù đã được xác nhận giao thành công.",
    CANCELLED: "Phiếu giao bù đã được hủy. BookShop sẽ tiếp tục trao đổi phương án khác với bạn.",
  };
  const message = await addCustomerVisibleMessage(ticket._id, adminId, texts[nextStatus]);
  return { ticket, message };
}

/**
 * Auto-resolves tickets parked on the customer that have gone quiet, so
 * abandoned threads do not sit in WAITING_CUSTOMER forever.
 */
async function autoResolveStaleTickets({ now = new Date() } = {}) {
  const config = require("../config");
  const cutoff = new Date(now.getTime() - config.support.staleWaitingCustomerMs);
  const stale = await SupportTicket.find({
    status: "WAITING_CUSTOMER",
    waitingCustomerSince: { $ne: null, $lte: cutoff },
  })
    .select("_id ticketCode waitingCustomerSince waitingCustomerMs assignee")
    .limit(100)
    .lean();

  let resolved = 0;
  for (const ticket of stale) {
    const waited = Math.max(0, now.getTime() - new Date(ticket.waitingCustomerSince).getTime());
    const claimed = await SupportTicket.updateOne(
      { _id: ticket._id, status: "WAITING_CUSTOMER" },
      {
        $set: {
          status: "RESOLVED",
          resolvedAt: now,
          waitingCustomerSince: null,
          waitingCustomerMs: (Number(ticket.waitingCustomerMs) || 0) + waited,
        },
      }
    );
    if (claimed.modifiedCount !== 1) continue;
    resolved += 1;
    // Messages require a real sender, so an unassigned ticket closes silently.
    if (ticket.assignee) {
      await addCustomerVisibleMessage(
        ticket._id,
        ticket.assignee,
        "Do chưa nhận được phản hồi thêm từ bạn, BookShop tạm thời đóng yêu cầu này. Bạn có thể nhắn lại bất cứ lúc nào để mở lại yêu cầu."
      ).catch(() => null);
    }
  }
  return { scanned: stale.length, resolved };
}

module.exports = {
  RESOLUTION_TYPES,
  autoResolveStaleTickets,
  COMPENSATION_TYPES,
  LOST_IN_TRANSIT_TYPES,
  completeManualRefund,
  createResolution,
  reconcileProcessingRefunds,
  settleProcessingRefund,
  updateReship,
};
