const express = require("express");
const Order = require("../models/Order");
const Book = require("../models/Book");
const User = require("../models/User");
const Review = require("../models/Review");
const ReviewReport = require("../models/ReviewReport");
const ReturnRequest = require("../models/ReturnRequest");
const orderService = require("../services/orderService");
const notificationService = require("../services/notificationService");
const shippingService = require("../services/shippingService");
const orderCancellationService = require("../services/orderCancellationService");
const {
  buildAdminOrderFilters,
  writeOrdersCsv,
} = require("../services/orderReportService");
const {
  advanceReturnRequest,
  serializeReturnRequest,
  syncLinkedTicket,
} = require("../services/returnRequestService");
const {
  auth,
  requireAnyPermission,
  requirePermission,
  staffOnly,
} = require("../middleware/auth");
const roleRegistry = require("../services/roleRegistry");
const { parsePositiveInt } = require("../utils/security");
const { runInTransaction } = require("../utils/transaction");
const auditLogService = require("../services/auditLogService");
const { FIELD_LABELS } = require("../services/auditLogPresenter");

const router = express.Router();

// All routes require admin authentication
router.use(auth, staffOnly);

/**
 * Log an order status transition onto the admin trail.
 *
 * Every endpoint below that moves an order reads its status first and calls
 * this after the service has committed, so `before` is the status the action
 * genuinely replaced. A transition that turned out to be a no-op produces no
 * entry, because diffFields yields nothing to record.
 */
async function recordOrderStatusChange(req, order, previousStatus, reason = "") {
  await auditLogService.record({
    action: auditLogService.ACTIONS.ORDER_STATUS_CHANGE,
    actor: req.user,
    req,
    targetType: "Order",
    targetId: order._id,
    targetLabel: order.orderCode || String(order._id),
    changes: auditLogService.diffFields(
      { status: previousStatus },
      { status: order.status },
      { status: FIELD_LABELS.status }
    ),
    reason,
  });
}

/** The status an order is currently in, for the before-half of the entry. */
async function currentOrderStatus(orderId) {
  const order = await Order.findById(orderId).select("status").lean();
  return order?.status || "";
}

// GET /api/admin/reviews - Paginated moderation queue.
router.get("/reviews", requirePermission("review.moderate"), async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = {};
    if (req.query.status === "visible") {
      filter.status = { $ne: "hidden" };
    } else if (req.query.status === "hidden") {
      filter.status = "hidden";
    }
    if (String(req.query.reported || "") === "1") {
      filter.reportCount = { $gt: 0 };
    }

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("user", "name email")
        .populate("book", "title")
        .populate("moderation.hiddenBy", "name")
        .sort({ reportCount: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);
    const reports = await ReviewReport.find({
      review: { $in: reviews.map((review) => review._id) },
    })
      .select("review reason details createdAt")
      .sort({ createdAt: -1 })
      .lean();
    const reportsByReview = new Map();
    for (const report of reports) {
      const key = String(report.review);
      const list = reportsByReview.get(key) || [];
      list.push(report);
      reportsByReview.set(key, list);
    }
    const decoratedReviews = reviews.map((review) => ({
      ...review,
      reports: reportsByReview.get(String(review._id)) || [],
    }));

    return res.json({
      success: true,
      data: {
        reviews: decoratedReviews,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch {
    return res.status(500).json({ success: false, message: "Không thể tải danh sách đánh giá" });
  }
});

// PATCH /api/admin/reviews/:id/moderation - Hide or restore a review.
router.patch("/reviews/:id/moderation", requirePermission("review.moderate"), async (req, res) => {
  try {
    const status = String(req.body?.status || "");
    const reason = String(req.body?.reason || "").trim();
    if (!["visible", "hidden"].includes(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
    }
    if (reason.length > 300 || (status === "hidden" && reason.length < 3)) {
      return res.status(400).json({
        success: false,
        message: "Cần nhập lý do ẩn từ 3 đến 300 ký tự",
      });
    }

    const reviewId = await runInTransaction(async (session) => {
      const review = await Review.findById(req.params.id).session(session);
      if (!review) {
        const error = new Error("Không tìm thấy đánh giá");
        error.statusCode = 404;
        throw error;
      }

      const previousStatus = review.status;
      review.status = status;
      review.moderation =
        status === "hidden"
          ? { hiddenBy: req.user._id, hiddenAt: new Date(), reason }
          : { hiddenBy: null, hiddenAt: null, reason: "" };
      await review.save({ session });

      if (previousStatus !== status) {
        await Book.adjustRating(
          review.book,
          status === "hidden" ? -review.rating : review.rating,
          status === "hidden" ? -1 : 1,
          { session }
        );
      }
      return review._id;
    });

    const review = await Review.findById(reviewId);
    await review.populate("user", "name email");
    await review.populate("book", "title");
    return res.json({
      success: true,
      message: status === "hidden" ? "Đã ẩn đánh giá" : "Đã khôi phục đánh giá",
      data: { review },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Dữ liệu kiểm duyệt không hợp lệ" });
    }
    return res.status(500).json({ success: false, message: "Không thể cập nhật đánh giá" });
  }
});


function getMonthRange(baseDate = new Date(), offset = 0) {
  const start = new Date(baseDate);
  start.setMonth(start.getMonth() + offset, 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function toPercentChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// GET /api/admin/orders - Get all orders
router.get("/orders", requirePermission("order.read"), async (req, res) => {
  try {
    const pageNumber = parsePositiveInt(req.query.page, 1, 10_000);
    const limitNumber = parsePositiveInt(req.query.limit, 20, 100);
    const skip = (pageNumber - 1) * limitNumber;

    const { baseFilter, filter } = await buildAdminOrderFilters(req.query);

    const query = Order.find(filter)
      .populate("user", "name email")
      .sort({ placedAt: -1, _id: -1 });

    const [orders, total, statusRows, returnStatusRows] = await Promise.all([
      query.skip(skip).limit(limitNumber),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ReturnRequest.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const statusCounts = Object.fromEntries(
      statusRows.map((row) => [row._id, row.count])
    );
    const matchingTotal = statusRows.reduce((sum, row) => sum + row.count, 0);
    const returnRequests = await ReturnRequest.find({
      order: { $in: orders.map((order) => order._id) },
    }).lean();
    const returnByOrder = new Map();
    for (const request of returnRequests.sort((left, right) =>
      new Date(left.createdAt) - new Date(right.createdAt)
    )) {
      returnByOrder.set(String(request.order), request);
    }
    const returnStatusCounts = Object.fromEntries(
      returnStatusRows.map((row) => [row._id, row.count])
    );

    res.json({
      success: true,
      data: {
        orders: orders.map((o) => ({
          ...o.toObject(),
          id: o._id,
          returnRequest: serializeReturnRequest(returnByOrder.get(String(o._id))),
        })),
        statusCounts: { all: matchingTotal, ...statusCounts },
        returnStatusCounts,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber),
        },
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Lỗi server",
      ...(error.statusCode ? {} : { error: error.message }),
    });
  }
});

// GET /api/admin/orders/export.csv - Stream every order matching the current filters.
router.get("/orders/export.csv", requirePermission("order.export"), async (req, res) => {
  try {
    const { filter } = await buildAdminOrderFilters(req.query);
    await writeOrdersCsv(res, filter);
  } catch (error) {
    if (res.headersSent) return res.end();
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Không thể xuất báo cáo đơn hàng",
    });
  }
});

// GET /api/admin/orders/:id/payment-audit - Sensitive gateway audit data
router.get("/orders/:id([0-9a-fA-F]{24})/payment-audit", requirePermission("order.payment.audit"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .schemaLevelProjections(false)
      .select("orderCode payment");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    return res.json({
      success: true,
      data: {
        orderId: order._id,
        orderCode: order.orderCode,
        paymentAudit: order.payment,
      },
    });
  } catch (error) {
    console.error("[admin payment audit]", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// GET /api/admin/orders/:id - Get single order
router.get("/orders/:id", requirePermission("order.read"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    const returnRequests = await ReturnRequest.find({ order: order._id })
      .sort({ createdAt: -1, _id: -1 });
    res.json({
      success: true,
      data: {
        order: {
          ...order.toObject(),
          id: order._id,
          returnRequest: serializeReturnRequest(returnRequests[0]),
          returnRequests: returnRequests.map(serializeReturnRequest),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// PATCH /api/admin/orders/:id/return-request - Approve or reject a pending request.
router.patch("/orders/:id([0-9a-fA-F]{24})/return-request", requirePermission("order.support"), async (req, res) => {
  try {
    const previous = await ReturnRequest.findOne({ order: req.params.id })
      .select("status refund.amount")
      .sort({ createdAt: -1 })
      .lean();
    const request = await advanceReturnRequest({
      orderId: req.params.id,
      adminId: req.user._id,
      status: req.body?.status,
      adminNote: req.body?.adminNote,
      restock: req.body?.restock,
      refundTransactionId: req.body?.refundTransactionId,
    });
    const notificationByStatus = {
      [ReturnRequest.STATUS.RETURNING]: [
        "Yêu cầu đổi trả đã được duyệt",
        `Yêu cầu đổi trả cho đơn ${request.order?.orderCode} đã được duyệt.`,
        "Đã duyệt yêu cầu đổi trả",
      ],
      [ReturnRequest.STATUS.REJECTED]: [
        "Yêu cầu đổi trả bị từ chối",
        `Yêu cầu đổi trả cho đơn ${request.order?.orderCode} đã bị từ chối.`,
        "Đã từ chối yêu cầu đổi trả",
      ],
      [ReturnRequest.STATUS.RECEIVED]: [
        "BookShop đã nhận hàng trả",
        `Hàng trả của đơn ${request.order?.orderCode} đã được tiếp nhận và đang xử lý hoàn tiền.`,
        "Đã xác nhận nhận hàng trả",
      ],
      [ReturnRequest.STATUS.CLOSED]: [
        "Yêu cầu đổi trả đã hoàn tất",
        `Yêu cầu đổi trả cho đơn ${request.order?.orderCode} đã hoàn tất.`,
        "Đã hoàn tất yêu cầu đổi trả",
      ],
    };
    const statusMessage = notificationByStatus[request.status];
    await notificationService.notifyUser(
      request.order?.user,
      {
        type: "refund",
        title: statusMessage[0],
        message: statusMessage[1],
        link: `/profile/orders/${req.params.id}`,
        metadata: {
          orderId: req.params.id,
          orderCode: request.order?.orderCode,
          returnRequestId: request._id,
          returnStatus: request.status,
        },
      },
      req
    ).catch(() => null);

    // Shared with the refund retry job, so a return that closes on a later
    // attempt updates its ticket exactly as one closed here does. The call is
    // idempotent, so running it after the service already synced is harmless.
    await syncLinkedTicket(request, req.user._id);

    // Refunds move customer money, so both outcomes are logged — a rejection
    // is as much a decision someone may have to answer for as an approval.
    await auditLogService.record({
      action:
        request.status === ReturnRequest.STATUS.REJECTED
          ? auditLogService.ACTIONS.REFUND_REJECT
          : auditLogService.ACTIONS.REFUND_APPROVE,
      actor: req.user,
      req,
      targetType: "ReturnRequest",
      targetId: request._id,
      targetLabel: request.order?.orderCode || String(req.params.id),
      changes: auditLogService.diffFields(
        { status: previous?.status, refundAmount: previous?.refund?.amount },
        { status: request.status, refundAmount: request.refund?.amount },
        {
          status: FIELD_LABELS.status,
          refundAmount: FIELD_LABELS.refundAmount,
        }
      ),
      reason: request.adminNote || "",
    });

    return res.json({
      success: true,
      message: statusMessage[2],
      data: { returnRequest: serializeReturnRequest(request) },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

// POST /api/admin/orders/:id/confirm - Duyệt đơn sang PROCESSING
router.post("/orders/:id/confirm", requirePermission("order.support"), async (req, res) => {
  try {
    const previousStatus = await currentOrderStatus(req.params.id);
    const order = await orderService.adminApproveOrder(
      req.params.id,
      req.user._id
    );
    await recordOrderStatusChange(req, order, previousStatus);
    res.json({
      success: true,
      message: "Đã xác nhận đơn hàng",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/admin/orders/:id/cancel - release reserved stock and voucher
router.post("/orders/:id/cancel", requirePermission("order.support"), async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Lý do huỷ không được vượt quá 500 ký tự",
      });
    }
    const previousStatus = await currentOrderStatus(req.params.id);
    const { order, replayed } = await orderCancellationService.requestAdminCancellation(
      req.params.id,
      req.user._id,
      reason
    );
    await recordOrderStatusChange(req, order, previousStatus, reason);
    return res.status(202).json({
      success: true,
      message: "Yêu cầu huỷ đơn đang được xử lý",
      data: { order: { ...order.toObject(), id: order._id }, replayed },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

// POST /api/admin/orders/:id/ship - PROCESSING → SHIPPED
router.post("/orders/:id/shipment", requirePermission("order.fulfill"), async (req, res) => {
  try {
    const { order, replayed } = await shippingService.createGhnShipment(
      req.params.id
    );
    if (!replayed) {
      await notificationService.notifyUser(
        order.user,
        {
          type: "shipping",
          title: "Đã tạo vận đơn GHN",
          message: `Vận đơn ${order.trackingNumber} cho đơn ${order.orderCode} đã được tạo và đang chờ GHN lấy hàng.`,
          link: `/profile/orders/${order._id}`,
          metadata: {
            orderId: order._id,
            orderCode: order.orderCode,
            carrier: "GHN",
            trackingNumber: order.trackingNumber,
          },
        },
        req
      ).catch(() => null);
    }
    return res.json({
      success: true,
      message: "Đã tạo vận đơn GHN Sandbox",
      data: { order: { ...order.toObject(), id: order._id }, replayed },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.post("/orders/:id/shipment/simulation", requirePermission("order.fulfill"), async (req, res) => {
  try {
    const result = await shippingService.controlSandboxSimulation(
      req.params.id,
      req.body?.action
    );
    return res.json({
      success: true,
      message:
        result.action === "pause"
          ? "Đã tạm dừng mô phỏng GHN Sandbox"
          : result.action === "resume"
            ? "Đã tiếp tục mô phỏng GHN Sandbox"
            : result.completed
              ? "Mô phỏng GHN Sandbox đã hoàn tất"
              : `Đã mô phỏng trạng thái ${result.status}`,
      data: {
        order: { ...result.order.toObject(), id: result.order._id },
        simulation: {
          action: result.action || "advance",
          advanced: result.advanced,
          completed: result.completed,
          status: result.status || result.order.shipment?.providerStatus,
        },
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

router.delete("/orders/:id/shipment", requirePermission("order.fulfill"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }
    if (order.status !== Order.STATUS.PROCESSING) {
      return res.status(400).json({
        success: false,
        message: "Chỉ có thể hủy vận đơn trước khi GHN nhận hàng",
      });
    }
    await shippingService.cancelGhnShipment(order);
    return res.json({
      success: true,
      message: "Đã hủy vận đơn GHN Sandbox",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

/**
 * Carrier details required to hand an order to shipping. Shared by `/ship` and
 * the back-compat status route so neither can move an order to SHIPPED without
 * a usable tracking reference.
 */
function parseShippingPayload(body = {}) {
  const carrier = String(body?.carrier || "").trim();
  const trackingNumber = String(body?.trackingNumber || "").trim();
  const estimatedDelivery = body?.estimatedDelivery || null;
  if (carrier.length < 2 || carrier.length > 100) {
    const error = new Error("Đơn vị vận chuyển không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  if (trackingNumber.length < 3 || trackingNumber.length > 100) {
    const error = new Error("Mã vận đơn không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  if (estimatedDelivery && Number.isNaN(new Date(estimatedDelivery).getTime())) {
    const error = new Error("Ngày giao dự kiến không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  return { carrier, trackingNumber, estimatedDelivery };
}

router.post("/orders/:id/ship", requirePermission("order.fulfill"), async (req, res) => {
  try {
    const previousStatus = await currentOrderStatus(req.params.id);
    const order = await orderService.adminMarkShipped(
      req.params.id,
      req.user._id,
      parseShippingPayload(req.body)
    );
    await recordOrderStatusChange(req, order, previousStatus);
    res.json({
      success: true,
      message: "Đã chuyển sang vận chuyển",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

// POST /api/admin/orders/:id/deliver - SHIPPED → DELIVERED
router.post("/orders/:id/deliver", requirePermission("order.fulfill"), async (req, res) => {
  try {
    const previousStatus = await currentOrderStatus(req.params.id);
    const order = await orderService.adminMarkDelivered(
      req.params.id,
      req.user._id
    );
    await recordOrderStatusChange(req, order, previousStatus);
    res.json({
      success: true,
      message: "Đã giao hàng thành công",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Back-compat: PATCH /api/admin/orders/:id/status - route by desired status
//
// Each target status carries the same permission and the same payload rules as
// its dedicated endpoint. Gating the route on "support OR fulfill" alone would
// let a support agent ship an order, or a warehouse account approve one.
const ORDER_STATUS_TRANSITIONS = {
  PROCESSING: {
    permission: "order.support",
    run: (id, adminId) => orderService.adminApproveOrder(id, adminId),
  },
  SHIPPED: {
    permission: "order.fulfill",
    run: (id, adminId, body) =>
      orderService.adminMarkShipped(id, adminId, parseShippingPayload(body)),
  },
  DELIVERED: {
    permission: "order.fulfill",
    run: (id, adminId) => orderService.adminMarkDelivered(id, adminId),
  },
};

router.patch("/orders/:id/status", requireAnyPermission("order.support", "order.fulfill"), async (req, res) => {
  try {
    const { status } = req.body;
    const transition = ORDER_STATUS_TRANSITIONS[status];
    if (!transition) {
      return res.status(400).json({
        success: false,
        message:
          "Chỉ hỗ trợ transition PROCESSING/SHIPPED/DELIVERED qua endpoint này",
      });
    }
    const allowed = await roleRegistry.roleHasPermission(
      req.user.role,
      transition.permission
    );
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện thao tác này",
      });
    }
    const previousStatus = await currentOrderStatus(req.params.id);
    const order = await transition.run(req.params.id, req.user._id, req.body);
    await recordOrderStatusChange(req, order, previousStatus);
    res.json({
      success: true,
      message: `Cập nhật trạng thái thành ${status}`,
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

// GET /api/admin/stats - Dashboard statistics
router.get("/stats", requirePermission("dashboard.view"), async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = getMonthRange(now, 0);
    const previousMonth = getMonthRange(now, -1);

    const [orderStats, books, users, monthOrders, monthUsers, monthSold] =
      await Promise.all([
      Order.getStats(),
      Book.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalStock: { $sum: "$stock" },
            totalSold: { $sum: "$sold" },
          },
        },
      ]),
      User.countDocuments(),
      Promise.all([
        Order.aggregate([
          {
            $match: {
              paidAt: { $gte: currentMonth.start, $lte: currentMonth.end },
              "payment.status": "PAID",
            },
          },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
            },
          },
        ]),
        Order.aggregate([
          {
            $match: {
              paidAt: { $gte: previousMonth.start, $lte: previousMonth.end },
              "payment.status": "PAID",
            },
          },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
            },
          },
        ]),
      ]),
      Promise.all([
        User.countDocuments({
          createdAt: { $gte: currentMonth.start, $lte: currentMonth.end },
        }),
        User.countDocuments({
          createdAt: { $gte: previousMonth.start, $lte: previousMonth.end },
        }),
      ]),
      Promise.all([
        Order.aggregate([
          {
            $match: {
              deliveredAt: { $gte: currentMonth.start, $lte: currentMonth.end },
              status: "DELIVERED",
            },
          },
          { $unwind: "$items" },
          { $group: { _id: null, sold: { $sum: "$items.quantity" } } },
        ]),
        Order.aggregate([
          {
            $match: {
              deliveredAt: { $gte: previousMonth.start, $lte: previousMonth.end },
              status: "DELIVERED",
            },
          },
          { $unwind: "$items" },
          { $group: { _id: null, sold: { $sum: "$items.quantity" } } },
        ]),
      ]),
    ]);

    const revenueCurrent = monthOrders[0][0]?.revenue || 0;
    const revenuePrevious = monthOrders[1][0]?.revenue || 0;
    const ordersCurrent = monthOrders[0][0]?.orders || 0;
    const ordersPrevious = monthOrders[1][0]?.orders || 0;

    const usersCurrent = monthUsers[0] || 0;
    const usersPrevious = monthUsers[1] || 0;

    const soldCurrent = monthSold[0][0]?.sold || 0;
    const soldPrevious = monthSold[1][0]?.sold || 0;

    // Staff without analytics.view still get a useful dashboard, minus money.
    const canSeeFinancials = await roleRegistry.roleHasPermission(
      req.user.role,
      "analytics.view"
    );
    const ordersWithoutMoney = { ...orderStats };
    delete ordersWithoutMoney.totalRevenue;
    delete ordersWithoutMoney.avgOrderValue;

    res.json({
      success: true,
      data: {
        books: {
          total: books[0]?.total || 0,
          totalStock: books[0]?.totalStock || 0,
          totalSold: books[0]?.totalSold || 0,
        },
        orders: canSeeFinancials ? orderStats : ordersWithoutMoney,
        users,
        canSeeFinancials,
        monthOverMonth: {
          ...(canSeeFinancials
            ? { revenue: toPercentChange(revenueCurrent, revenuePrevious) }
            : {}),
          orders: toPercentChange(ordersCurrent, ordersPrevious),
          users: toPercentChange(usersCurrent, usersPrevious),
          soldBooks: toPercentChange(soldCurrent, soldPrevious),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

module.exports = router;
