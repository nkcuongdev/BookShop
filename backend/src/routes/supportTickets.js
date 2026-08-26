const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const SupportTicket = require("../models/SupportTicket");
const SupportTicketMessage = require("../models/SupportTicketMessage");
const User = require("../models/User");
const { auth, requirePermission } = require("../middleware/auth");
const roleRegistry = require("../services/roleRegistry");
const { syncManagedAssets } = require("../services/assetLifecycleService");
const notificationService = require("../services/notificationService");
const shippingService = require("../services/shippingService");
const {
  getReturnEligibility,
  normalizeReturnPayload,
} = require("../services/returnRequestService");
const {
  completeManualRefund,
  createResolution,
  updateReship,
} = require("../services/supportResolutionService");
const { slaDeadlines } = require("../services/supportSlaService");
const config = require("../config");
const { createRateLimiter, normalizedIp, parsePositiveInt, safeRegex } = require("../utils/security");

const customerRouter = express.Router();
const adminRouter = express.Router();
const CLOSED_STATUSES = new Set(["RESOLVED", "CLOSED"]);
const CATEGORY_LABELS = {
  NOT_RECEIVED: "Chưa nhận được hàng",
  ITEM_FAULT: "Hàng bị lỗi, sai hoặc thiếu",
  PAYMENT_ISSUE: "Vấn đề thanh toán / hoàn tiền",
  RETURN_REQUEST: "Muốn đổi/trả hàng",
  OTHER: "Vấn đề khác",
};

const ITEM_ISSUE_LABELS = {
  DAMAGED: "Sản phẩm bị hư hỏng",
  WRONG_ITEM: "Giao sai sản phẩm",
  MISSING_ITEM: "Thiếu sản phẩm",
  QUALITY_ISSUE: "Chất lượng không đạt",
};

const messageLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "support-ticket-message",
  message: "Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau",
  keyGenerator: (req) => `${normalizedIp(req)}:${req.user?._id || "anonymous"}`,
});

// Ticket creation was previously unthrottled, letting one upset customer flood
// the queue and destroy the SLA statistics.
const createLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 5,
  keyPrefix: "support-ticket-create",
  message: "Bạn đã tạo quá nhiều yêu cầu hỗ trợ, vui lòng thử lại sau",
  keyGenerator: (req) => `${normalizedIp(req)}:${req.user?._id || "anonymous"}`,
});

function cleanText(value, maxLength) {
  const text = typeof value === "string" ? value.split("\0").join("").trim() : "";
  return text && text.length <= maxLength ? text : null;
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  const urls = value.map((item) => String(item || "").trim()).filter(Boolean);
  if (urls.length > 3 || new Set(urls).size !== urls.length || urls.some((url) => url.length > 2048)) {
    const error = new Error("Ticket chỉ được đính kèm tối đa 3 ảnh hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  return urls;
}

function serializeTicket(ticket, { customer = false } = {}) {
  const item = ticket?.toObject ? ticket.toObject() : ticket;
  const now = Date.now();
  const responseDeadline = new Date(item.responseDueAt).getTime();
  // Time spent waiting on the customer does not count against the agent, so it
  // is added back onto the resolution deadline (including the ongoing wait).
  const bankedWait = Number(item.waitingCustomerMs) || 0;
  const ongoingWait =
    item.status === "WAITING_CUSTOMER" && item.waitingCustomerSince
      ? Math.max(0, now - new Date(item.waitingCustomerSince).getTime())
      : 0;
  const pausedMs = bankedWait + ongoingWait;
  const resolutionDeadline = new Date(item.resolutionDueAt).getTime() + pausedMs;
  const serialized = {
    ...item,
    id: item._id,
    categoryLabel: CATEGORY_LABELS[item.category] || item.category,
    itemIssueLabel: ITEM_ISSUE_LABELS[item.requestDetails?.itemIssue] || null,
    returnShippingPaidBy: item.faultParty === "shop" ? "shop" : "customer",
    effectiveResolutionDueAt: new Date(resolutionDeadline),
    sla: {
      responseBreached: !item.firstRespondedAt && now > responseDeadline,
      // The clock is suspended entirely while the ball is in the customer's court.
      resolutionBreached:
        !CLOSED_STATUSES.has(item.status) &&
        item.status !== "WAITING_CUSTOMER" &&
        now > resolutionDeadline,
      paused: item.status === "WAITING_CUSTOMER",
      pausedMs,
    },
  };
  if (customer && serialized.resolution) {
    const resolution = serialized.resolution;
    serialized.resolution = {
      type: resolution.type,
      status: resolution.status,
      items: resolution.items || [],
      amount: resolution.amount || 0,
      returnRequest: resolution.returnRequest || null,
      refund: resolution.refund
        ? {
            transactionId: resolution.refund.transactionId || "",
            completedAt: resolution.refund.completedAt || null,
          }
        : null,
      shipment: resolution.shipment || null,
      createdAt: resolution.createdAt,
      completedAt: resolution.completedAt,
    };
  }
  return serialized;
}

function ticketPopulate(query) {
  return query
    .populate("user", "name email")
    .populate("order", "orderCode status totalAmount placedAt")
    .populate("assignee", "name email");
}

function ticketDetailPopulate(query) {
  return query
    .populate("user", "name email")
    .populate("order", "orderCode status totalAmount subtotal discountAmount placedAt items payment supportCompensation")
    .populate("assignee", "name email")
    .populate("resolution.createdBy", "name email")
    .populate("resolution.returnRequest", "returnCode status returnInstructions refund expectedRefundAmount");
}

function customerTicketDetailPopulate(query) {
  return query
    .populate("user", "name email")
    .populate("order", "orderCode status totalAmount placedAt")
    .populate("assignee", "name")
    .populate("resolution.returnRequest", "returnCode status returnInstructions expectedRefundAmount refund.status refund.completedAt");
}

function encodeMessageCursor(message) {
  return Buffer.from(JSON.stringify({
    createdAt: new Date(message.createdAt).toISOString(),
    id: String(message._id),
  })).toString("base64url");
}

function decodeMessageCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !mongoose.isValidObjectId(parsed.id)) {
      throw new Error("invalid");
    }
    return { createdAt, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    const error = new Error("Cursor tin nhắn không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
}

async function getMessages(ticketId, { before = "", limit = 50 } = {}) {
  const cursor = decodeMessageCursor(before);
  const boundedLimit = parsePositiveInt(limit, 50, 100);
  const filter = { ticket: ticketId };
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ];
  }
  const rows = await SupportTicketMessage.find(filter)
    .populate("sender", "name")
    .sort({ createdAt: -1, _id: -1 })
    .limit(boundedLimit + 1)
    .lean();
  const hasMore = rows.length > boundedLimit;
  const page = rows.slice(0, boundedLimit).reverse();
  return {
    messages: page,
    pagination: {
      hasMore,
      nextCursor: hasMore && page.length ? encodeMessageCursor(page[0]) : null,
      limit: boundedLimit,
    },
  };
}

function emitTicket(req, event, ticket) {
  const io = req.app.get("io");
  if (!io || !ticket) return;
  const ticketId = String(ticket._id);
  io.to("role:admin").emit(event, { ticketId, ticket: serializeTicket(ticket) });
  const userId = ticket.user?._id || ticket.user;
  if (userId) io.to(`user:${userId}`).emit(event, { ticketId, ticket: serializeTicket(ticket, { customer: true }) });
}

/**
 * Maintains the WAITING_CUSTOMER stopwatch on a ticket document. Call before
 * assigning the new status; banks the elapsed wait when leaving the state and
 * starts the clock when entering it.
 */
function trackWaitingClock(ticket, nextStatus) {
  const leavingWait = ticket.status === "WAITING_CUSTOMER" && nextStatus !== "WAITING_CUSTOMER";
  const enteringWait = ticket.status !== "WAITING_CUSTOMER" && nextStatus === "WAITING_CUSTOMER";
  if (leavingWait && ticket.waitingCustomerSince) {
    ticket.waitingCustomerMs =
      (Number(ticket.waitingCustomerMs) || 0) +
      Math.max(0, Date.now() - new Date(ticket.waitingCustomerSince).getTime());
    ticket.waitingCustomerSince = null;
  }
  if (enteringWait) ticket.waitingCustomerSince = new Date();
}

function validateTicketId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Mã ticket không hợp lệ" });
  }
  return next();
}

customerRouter.use(auth);
customerRouter.param("id", validateTicketId);

customerRouter.get("/", async (req, res, next) => {
  try {
    const tickets = await ticketPopulate(
      SupportTicket.find({ user: req.user._id }).sort({ lastMessageAt: -1, createdAt: -1 })
    ).lean();
    return res.json({ success: true, data: { tickets: tickets.map((ticket) => serializeTicket(ticket, { customer: true })) } });
  } catch (error) {
    return next(error);
  }
});

customerRouter.post("/", createLimiter, async (req, res, next) => {
  let ticket = null;
  try {
    const orderId = String(req.body?.orderId || "");
    const category = String(req.body?.category || "").toUpperCase();
    const description = cleanText(req.body?.description, 4000);
    const subject = cleanText(req.body?.subject, 160) || CATEGORY_LABELS[category];
    const attachments = normalizeAttachments(req.body?.attachments);
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: "Mã đơn hàng không hợp lệ" });
    }
    if (!SupportTicket.CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: "Loại vấn đề không hợp lệ" });
    }
    if (!description) {
      return res.status(400).json({ success: false, message: "Mô tả phải có từ 1 đến 4000 ký tự" });
    }
    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }
    // One open ticket per (order, category): re-reporting the same problem
    // belongs in the existing thread, not in a new ticket.
    const sameCategoryOpen = await SupportTicket.findOne({
      user: req.user._id,
      order: order._id,
      category,
      status: { $nin: ["RESOLVED", "CLOSED"] },
    })
      .select("_id ticketCode")
      .lean();
    if (sameCategoryOpen) {
      return res.status(409).json({
        success: false,
        message: `Đơn hàng đã có yêu cầu hỗ trợ ${sameCategoryOpen.ticketCode} về vấn đề này đang được xử lý. Vui lòng trao đổi tiếp trong yêu cầu đó.`,
        code: "DUPLICATE_TICKET",
        data: { ticketId: sameCategoryOpen._id },
      });
    }
    const openForOrder = await SupportTicket.countDocuments({
      user: req.user._id,
      order: order._id,
      status: { $nin: ["RESOLVED", "CLOSED"] },
    });
    if (openForOrder >= config.support.maxOpenTicketsPerOrder) {
      return res.status(409).json({
        success: false,
        message: `Đơn hàng này đã có ${openForOrder} yêu cầu hỗ trợ đang mở. Vui lòng chờ xử lý xong trước khi tạo thêm.`,
        code: "TOO_MANY_OPEN_TICKETS",
      });
    }
    let requestDetails = undefined;
    // Both goods complaints identify the affected products, so they share one
    // path. They differ only in who is at fault, which sets the claim window
    // and who pays return shipping.
    const isItemFault = category === "ITEM_FAULT";
    if (isItemFault || category === "RETURN_REQUEST") {
      const faultParty = isItemFault ? "shop" : "customer";
      const itemIssue = isItemFault
        ? String(req.body?.itemIssue || "").toUpperCase()
        : null;
      if (isItemFault && !SupportTicket.ITEM_ISSUES.includes(itemIssue)) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn tình trạng sản phẩm (hư hỏng, giao sai, thiếu hàng hoặc chất lượng)",
          code: "ITEM_ISSUE_REQUIRED",
        });
      }
      const existingReturns = await ReturnRequest.find({ order: order._id })
        .select("status items")
        .lean();
      const eligibility = getReturnEligibility(order, existingReturns, { faultParty });
      if (!eligibility.eligible) {
        const messages = {
          ALREADY_REQUESTED: "Đơn hàng đã có hồ sơ đổi trả",
          ORDER_NOT_DELIVERED: "Chỉ đơn hàng đã giao mới có thể gửi yêu cầu về sản phẩm",
          DELIVERY_DATE_MISSING: "Đơn hàng chưa có thời điểm giao hợp lệ",
          RETURN_WINDOW_EXPIRED: `Đã quá thời hạn ${eligibility.windowDays} ngày kể từ ngày giao hàng`,
        };
        return res.status(eligibility.code === "ALREADY_REQUESTED" ? 409 : 422).json({
          success: false,
          message: messages[eligibility.code] || "Đơn hàng chưa đủ điều kiện",
          code: eligibility.code,
        });
      }
      // An ITEM_FAULT ticket carries the defect the customer picked, so the
      // return reason no longer has to be guessed from the category. A change
      // of mind is always OTHER: claiming a defect here would take the shorter
      // window and the customer-paid shipping while describing a shop mistake,
      // so such a report belongs under ITEM_FAULT instead.
      const normalized = normalizeReturnPayload(order, {
        items: req.body?.requestedItems,
        reason: itemIssue || "OTHER",
        details: description,
        images: attachments,
      });
      requestDetails = {
        returnReason: normalized.reason,
        itemIssue,
        items: normalized.items,
      };
    }
    ticket = await SupportTicket.create({
      user: req.user._id,
      order: order._id,
      category,
      subject,
      description,
      attachments,
      requestDetails,
      lastMessagePreview: description.slice(0, 240),
    });
    await syncManagedAssets({
      entityType: "support_ticket",
      purpose: "support_ticket",
      entityLabel: "ticket hỗ trợ",
      entityId: ticket._id,
      ownerId: req.user._id,
      urls: attachments,
    });
    ticket = await ticketPopulate(SupportTicket.findById(ticket._id));
    emitTicket(req, "support:ticket", ticket);
    await notificationService.notifyAdmins(
      {
        type: "order",
        title: `Ticket hỗ trợ mới · ${CATEGORY_LABELS[category] || category}`,
        message: `${req.user.name || "Khách hàng"} vừa tạo yêu cầu ${ticket.ticketCode} cho đơn ${order.orderCode}.`,
        link: `/admin/support/${ticket._id}`,
        metadata: {
          ticketId: ticket._id,
          ticketCode: ticket.ticketCode,
          category,
          priority: ticket.priority,
        },
      },
      req
    ).catch(() => null);
    return res.status(201).json({ success: true, data: { ticket: serializeTicket(ticket, { customer: true }) } });
  } catch (error) {
    if (ticket?._id) await SupportTicket.deleteOne({ _id: ticket._id }).catch(() => {});
    return next(error);
  }
});

customerRouter.get("/:id", async (req, res, next) => {
  try {
    const ticket = await customerTicketDetailPopulate(
      SupportTicket.findOne({ _id: req.params.id, user: req.user._id })
    ).lean();
    if (!ticket) return res.status(404).json({ success: false, message: "Không tìm thấy ticket" });
    const messagePage = await getMessages(ticket._id, req.query);
    return res.json({ success: true, data: { ticket: serializeTicket(ticket, { customer: true }), ...messagePage } });
  } catch (error) {
    return next(error);
  }
});

customerRouter.get("/:id/messages", async (req, res, next) => {
  try {
    const ticket = await SupportTicket.exists({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ success: false, message: "Không tìm thấy ticket" });
    return res.json({ success: true, data: await getMessages(req.params.id, req.query) });
  } catch (error) {
    return next(error);
  }
});

customerRouter.post("/:id/messages", messageLimiter, async (req, res, next) => {
  try {
    const text = cleanText(req.body?.text, 2000);
    if (!text) return res.status(400).json({ success: false, message: "Tin nhắn phải có từ 1 đến 2000 ký tự" });
    const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ success: false, message: "Không tìm thấy ticket" });
    if (ticket.status === "CLOSED") {
      return res.status(409).json({ success: false, message: "Ticket đã đóng và không thể nhận thêm tin nhắn" });
    }
    const message = await SupportTicketMessage.create({
      ticket: ticket._id,
      sender: req.user._id,
      from: "customer",
      text,
    });
    ticket.lastMessageAt = message.createdAt;
    ticket.lastMessagePreview = text.slice(0, 240);
    if (ticket.status === "WAITING_CUSTOMER" || ticket.status === "RESOLVED") {
      trackWaitingClock(ticket, "IN_PROGRESS");
      ticket.status = "IN_PROGRESS";
      ticket.resolvedAt = null;
    }
    await ticket.save();
    emitTicket(req, "support:message", ticket);
    await notificationService.notifyAdmins(
      {
        type: "order",
        title: "Khách hàng phản hồi ticket hỗ trợ",
        message: `${ticket.ticketCode}: ${text.slice(0, 160)}`,
        link: `/admin/support/${ticket._id}`,
        metadata: { ticketId: ticket._id, ticketCode: ticket.ticketCode },
      },
      req
    ).catch(() => null);
    return res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(auth, requirePermission("ticket.read"));
adminRouter.param("id", validateTicketId);

/**
 * Staff who may be assigned a ticket. Resolved per request: roles are created
 * at runtime, so caching this at module load would miss any new one.
 */
const ticketAgentRoles = () => roleRegistry.rolesWithPermission("ticket.write");

adminRouter.get("/agents", async (_req, res, next) => {
  try {
    const agents = await User.find({
      role: { $in: await ticketAgentRoles() },
      status: { $ne: "banned" },
    })
      .select("name email")
      .sort({ name: 1 })
      .lean();
    return res.json({ success: true, data: { agents } });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/shipping-providers", (_req, res) => {
  return res.json({
    success: true,
    data: { providers: shippingService.getShippingProviders() },
  });
});

adminRouter.get("/", async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 30, 100);
    const filter = {};
    if (SupportTicket.STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (SupportTicket.PRIORITIES.includes(req.query.priority)) filter.priority = req.query.priority;
    if (mongoose.isValidObjectId(req.query.assignee)) filter.assignee = req.query.assignee;
    if (req.query.assignee === "unassigned") filter.assignee = null;
    const search = safeRegex(req.query.search);
    if (search) filter.$or = [{ ticketCode: search }, { subject: search }, { lastMessagePreview: search }];
    const [tickets, total] = await Promise.all([
      ticketPopulate(SupportTicket.find(filter))
        // Numeric ranks, because the status/priority enums sort alphabetically
        // (CLOSED before OPEN, HIGH below NORMAL) which is not the work order.
        .sort({ statusRank: 1, priorityRank: -1, responseDueAt: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);
    return res.json({
      success: true,
      data: {
        tickets: tickets.map(serializeTicket),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/:id", async (req, res, next) => {
  try {
    const ticket = await ticketDetailPopulate(SupportTicket.findById(req.params.id)).lean();
    if (!ticket) return res.status(404).json({ success: false, message: "Không tìm thấy ticket" });
    const messagePage = await getMessages(ticket._id, req.query);
    return res.json({ success: true, data: { ticket: serializeTicket(ticket), ...messagePage } });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/:id/messages", async (req, res, next) => {
  try {
    const ticket = await SupportTicket.exists({ _id: req.params.id });
    if (!ticket) return res.status(404).json({ success: false, message: "Không tìm thấy ticket" });
    return res.json({ success: true, data: await getMessages(req.params.id, req.query) });
  } catch (error) {
    return next(error);
  }
});

async function resolutionResponse(req, res, result, message) {
  const ticket = await ticketDetailPopulate(SupportTicket.findById(req.params.id));
  emitTicket(req, "support:ticket", ticket);
  await notificationService.notifyUser(
    ticket.user?._id || ticket.user,
    {
      type: "order",
      title: "Yêu cầu hỗ trợ đã được xử lý",
      message,
      link: `/profile/support/${ticket._id}`,
      metadata: {
        ticketId: ticket._id,
        ticketCode: ticket.ticketCode,
        resolutionType: ticket.resolution?.type,
        resolutionStatus: ticket.resolution?.status,
      },
    },
    req
  ).catch(() => null);
  return res.json({ success: true, data: { ticket: serializeTicket(ticket), message: result.message } });
}

adminRouter.post("/:id/resolution", requirePermission("ticket.resolve"), async (req, res, next) => {
  try {
    const result = await createResolution({
      ticketId: req.params.id,
      adminId: req.user._id,
      payload: req.body,
    });
    return await resolutionResponse(req, res, result, "BookShop đã cập nhật phương án xử lý cho đơn hàng của bạn.");
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    }
    return next(error);
  }
});

adminRouter.patch("/:id/resolution/refund", requirePermission("ticket.resolve"), async (req, res, next) => {
  try {
    const result = await completeManualRefund({
      ticketId: req.params.id,
      adminId: req.user._id,
      transactionId: req.body?.transactionId,
    });
    return await resolutionResponse(req, res, result, "Khoản hoàn tiền đã được ghi nhận hoàn tất.");
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    }
    return next(error);
  }
});

adminRouter.patch("/:id/resolution/reship", requirePermission("ticket.resolve"), async (req, res, next) => {
  try {
    const result = await updateReship({
      ticketId: req.params.id,
      adminId: req.user._id,
      payload: req.body,
    });
    return await resolutionResponse(req, res, result, "Phiếu giao bù/giao lại đã được cập nhật.");
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    }
    return next(error);
  }
});

adminRouter.patch("/:id", requirePermission("ticket.write"), async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: "Không tìm thấy ticket" });
    const nextStatus = req.body?.status;
    const nextPriority = req.body?.priority;
    if (nextStatus !== undefined) {
      if (!SupportTicket.STATUSES.includes(nextStatus)) return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
      if (
        ["RESOLVED", "CLOSED"].includes(nextStatus) &&
        ticket.resolution &&
        !SupportTicket.RESOLUTION_TERMINAL_STATUSES.includes(ticket.resolution.status)
      ) {
        return res.status(409).json({
          success: false,
          message: "Chưa thể hoàn tất ticket khi nghiệp vụ xử lý đơn hàng chưa hoàn thành",
          code: "RESOLUTION_NOT_COMPLETED",
        });
      }
      trackWaitingClock(ticket, nextStatus);
      ticket.status = nextStatus;
      ticket.resolvedAt = nextStatus === "RESOLVED" || nextStatus === "CLOSED" ? ticket.resolvedAt || new Date() : null;
      ticket.closedAt = nextStatus === "CLOSED" ? new Date() : null;
    }
    if (nextPriority !== undefined) {
      if (!SupportTicket.PRIORITIES.includes(nextPriority)) return res.status(400).json({ success: false, message: "Mức ưu tiên không hợp lệ" });
      if (ticket.priority !== nextPriority) {
        ticket.priority = nextPriority;
        const deadlines = slaDeadlines(nextPriority, ticket.createdAt);
        ticket.responseDueAt = deadlines.responseDueAt;
        ticket.resolutionDueAt = deadlines.resolutionDueAt;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "assigneeId")) {
      const assigneeId = req.body.assigneeId;
      if (assigneeId) {
        if (!mongoose.isValidObjectId(assigneeId)) return res.status(400).json({ success: false, message: "Người phụ trách không hợp lệ" });
        const agent = await User.findOne({
          _id: assigneeId,
          role: { $in: await ticketAgentRoles() },
        }).select("_id");
        if (!agent) return res.status(400).json({ success: false, message: "Người phụ trách phải là nhân viên hỗ trợ" });
        ticket.assignee = agent._id;
      } else ticket.assignee = null;
    }
    await ticket.save();
    const populated = await ticketPopulate(SupportTicket.findById(ticket._id));
    emitTicket(req, "support:ticket", populated);
    return res.json({ success: true, data: { ticket: serializeTicket(populated) } });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post("/:id/messages", requirePermission("ticket.write"), messageLimiter, async (req, res, next) => {
  try {
    const text = cleanText(req.body?.text, 2000);
    if (!text) return res.status(400).json({ success: false, message: "Tin nhắn phải có từ 1 đến 2000 ký tự" });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: "Không tìm thấy ticket" });
    if (ticket.status === "CLOSED") return res.status(409).json({ success: false, message: "Ticket đã đóng" });
    const message = await SupportTicketMessage.create({ ticket: ticket._id, sender: req.user._id, from: "admin", text });
    ticket.firstRespondedAt ||= message.createdAt;
    ticket.assignee ||= req.user._id;
    ticket.lastMessageAt = message.createdAt;
    ticket.lastMessagePreview = text.slice(0, 240);
    if (ticket.status === "OPEN") ticket.status = "IN_PROGRESS";
    await ticket.save();
    const populated = await ticketPopulate(SupportTicket.findById(ticket._id));
    emitTicket(req, "support:message", populated);
    await notificationService.notifyUser(
      ticket.user,
      {
        type: "order",
        title: "Bộ phận hỗ trợ đã phản hồi",
        message: `${ticket.ticketCode}: ${text.slice(0, 160)}`,
        link: `/profile/support/${ticket._id}`,
        metadata: { ticketId: ticket._id, ticketCode: ticket.ticketCode },
      },
      req
    ).catch(() => null);
    return res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    return next(error);
  }
});

module.exports = { customerSupportTicketRouter: customerRouter, adminSupportTicketRouter: adminRouter };
