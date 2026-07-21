const express = require("express");
const Order = require("../models/Order");
const config = require("../config");
const orderService = require("../services/orderService");
const paymentGateway = require("../services/paymentGateway");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const notificationService = require("../services/notificationService");
const shippingService = require("../services/shippingService");
const orderCancellationService = require("../services/orderCancellationService");
const { auth } = require("../middleware/auth");
const roleRegistry = require("../services/roleRegistry");
const {
  createRateLimiter,
  hashRateLimitPart,
  normalizedIp,
  parsePositiveInt,
  safeRegex,
} = require("../utils/security");
const { serializeCustomerOrder } = require("../serializers/orderSerializer");
const ReturnRequest = require("../models/ReturnRequest");
const {
  completeReturnRefund,
  createReturnRequest,
  getReturnEligibility,
  serializeReturnRequest,
} = require("../services/returnRequestService");
const supportResolutionService = require("../services/supportResolutionService");
const SupportTicket = require("../models/SupportTicket");

const router = express.Router();

const orderCreateIpLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 12,
  keyPrefix: "order-create-ip",
  message: "Bạn đang tạo đơn quá nhanh, vui lòng thử lại sau",
});
const orderCreateUserLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 6,
  keyPrefix: "order-create-user",
  keyGenerator: (req) => hashRateLimitPart(req.user?._id || normalizedIp(req)),
  message: "Bạn đang tạo đơn quá nhanh, vui lòng thử lại sau",
});
const paymentRetryIpLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyPrefix: "payment-retry-ip",
  message: "Bạn đang thử thanh toán quá nhanh, vui lòng thử lại sau",
});
const paymentRetryUserLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "payment-retry-user",
  keyGenerator: (req) => hashRateLimitPart(req.user?._id || normalizedIp(req)),
  message: "Bạn đang thử thanh toán quá nhanh, vui lòng thử lại sau",
});

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}

function getFrontendUrl(req) {
  const origin = req.get("origin");
  if (
    process.env.NODE_ENV !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "")
  ) {
    return origin;
  }
  return config.frontendUrl;
}

function paymentReturnStatus(result) {
  if (!result?.latePayment) return "success";
  return result.order?.status === Order.STATUS.REFUNDED
    ? "refunded"
    : "refunding";
}

async function serializeOrderWithReturn(order) {
  const returnRequests = await ReturnRequest.find({ order: order._id })
    .sort({ createdAt: -1, _id: -1 });
  const serializedRequests = returnRequests.map(serializeReturnRequest);
  return {
    ...serializeCustomerOrder(order),
    // Compatibility alias for existing clients; new clients render the full history.
    returnRequest: serializedRequests[0] || null,
    returnRequests: serializedRequests,
    returnEligibility: getReturnEligibility(order, returnRequests),
  };
}

// ──────────────────────────────────────────────────────────────
// Customer endpoints
// ──────────────────────────────────────────────────────────────

// POST /api/orders - Tạo đơn (soft-booking)
router.post(
  "/",
  auth,
  orderCreateIpLimiter,
  orderCreateUserLimiter,
  async (req, res) => {
  try {
    const idempotencyKey = req.get("Idempotency-Key");
    const {
      items,
      shippingAddress,
      paymentMethod,
      voucherCode,
      orderVoucherCode,
      shippingVoucherCode,
      shippingMethod,
      shippingOptionId,
      shippingFee,
      note,
      pointsToRedeem,
      checkoutSource,
      expectedTotal,
    } = req.body;

    if (
      typeof shippingOptionId !== "string" ||
      shippingOptionId.trim().length === 0
    ) {
      return res.status(422).json({
        success: false,
        message: "Vui lòng chọn phương thức vận chuyển hợp lệ",
        code: "SHIPPING_OPTION_REQUIRED",
      });
    }

    const authoritativeShipping =
      await shippingService.resolveShippingSelection({
        items,
        shippingAddress,
        optionId: shippingOptionId.trim(),
      });

    const { order, paymentUrl, replayed } = await orderService.createOrder({
      userId: req.user._id,
      items,
      shippingAddress,
      paymentMethod,
      voucherCode,
      orderVoucherCode,
      shippingVoucherCode,
      shippingMethod,
      shippingFee,
      authoritativeShipping,
      note,
      pointsToRedeem,
      checkoutSource,
      expectedTotal,
      clientIp: getClientIp(req),
      frontendUrl: getFrontendUrl(req),
      idempotencyKey,
    });

    if (!replayed) {
      await AnalyticsEvent.updateOne(
        { type: "order_created", order: order._id },
        {
          $setOnInsert: {
            user: req.user._id,
            sessionId: req.body.sessionId || "",
            value: order.totalAmount,
            metadata: {
              orderCode: order.orderCode,
              paymentMethod: order.payment?.method,
            },
          },
        },
        { upsert: true }
      ).catch(() => null);
      await notificationService.notifyUser(
        req.user._id,
        {
          type: "order",
          title: "Đặt hàng thành công",
          message: `Đơn hàng ${order.orderCode} đã được tạo thành công.`,
          link: `/profile/orders/${order._id}`,
          metadata: { orderId: order._id, orderCode: order.orderCode },
        },
        req
      ).catch(() => null);
      await notificationService.notifyAdmins(
        {
          type: "order",
          title: "Đơn hàng mới",
          message: `Đơn hàng ${order.orderCode} cần được xử lý.`,
          link: `/admin/orders/${order._id}`,
          metadata: { orderId: order._id, orderCode: order.orderCode },
        },
        req
      ).catch(() => null);
    }

    res.status(201).json({
      success: true,
      message: "Đặt hàng thành công",
      data: {
        order: serializeCustomerOrder(order),
        paymentUrl,
        replayed: !!replayed,
      },
    });
  } catch (error) {
    const status =
      error.statusCode ||
      (error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400);
    res.status(status).json({
      success: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.field ? { field: error.field } : {}),
      ...(error.quote ? { quote: error.quote } : {}),
    });
  }
  }
);

// GET /api/orders - Orders của user hiện tại
router.get("/", auth, async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 10, 50);
    const filter = { user: req.user._id };
    if (req.query.status && Object.values(Order.STATUS).includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const searchRegex = safeRegex(String(req.query.search || "").slice(0, 100));
    if (searchRegex) {
      filter.$or = [
        { orderCode: searchRegex },
        { "items.title": searchRegex },
      ];
    }

    const [orders, total, summaryRows] = await Promise.all([
      Order.aggregate([
        { $match: filter },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            orderCode: 1,
            status: 1,
            totalAmount: 1,
            placedAt: 1,
            createdAt: 1,
            itemCount: { $size: { $ifNull: ["$items", []] } },
            itemsPreview: {
              $map: {
                input: { $slice: [{ $ifNull: ["$items", []] }, 4] },
                as: "item",
                in: {
                  book: "$$item.book",
                  title: "$$item.title",
                  imageUrl: "$$item.imageUrl",
                  quantity: "$$item.quantity",
                },
              },
            },
          },
        },
      ]),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: { user: req.user._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpend: {
              $sum: {
                $cond: [
                  { $eq: ["$status", Order.STATUS.DELIVERED] },
                  "$totalAmount",
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);
    const summary = summaryRows[0] || { totalOrders: 0, totalSpend: 0 };
    res.json({
      success: true,
      data: {
        orders: orders.map((order) => ({ ...order, id: order._id })),
        count: total,
        summary: {
          totalOrders: summary.totalOrders || 0,
          totalSpend: summary.totalSpend || 0,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/orders/:id - Chi tiết 1 đơn
router.get("/code/:orderCode", auth, async (req, res) => {
  try {
    const orderCode = String(req.params.orderCode || "").trim().slice(0, 100);
    if (!/^OD-[A-Z0-9-]+$/i.test(orderCode)) {
      return res.status(400).json({ success: false, message: "Mã đơn không hợp lệ" });
    }
    const order = await Order.findOne({ orderCode });
    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }
    if (
      String(order.user) !== String(req.user._id) &&
      !(await roleRegistry.roleHasPermission(req.user.role, "order.read"))
    ) {
      return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    return res.json({
      success: true,
      data: { order: await serializeOrderWithReturn(order) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:id([0-9a-fA-F]{24})", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email"
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng" });
    }
    if (
      order.user._id.toString() !== req.user._id.toString() &&
      !(await roleRegistry.roleHasPermission(req.user.role, "order.read"))
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền truy cập" });
    }
    res.json({
      success: true,
      data: { order: await serializeOrderWithReturn(order) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/orders/:id/return-request - Line/quantity-based self-service returns.
router.post("/:id([0-9a-fA-F]{24})/return-request", auth, async (req, res) => {
  try {
    const { request, order } = await createReturnRequest({
      orderId: req.params.id,
      userId: req.user._id,
      payload: req.body,
    });
    await notificationService.notifyAdmins(
      {
        type: "refund",
        title: "Yêu cầu đổi trả mới",
        message: `Đơn hàng ${order.orderCode} có yêu cầu đổi trả cần xử lý.`,
        link: `/admin/orders/${order._id}`,
        metadata: {
          orderId: order._id,
          orderCode: order.orderCode,
          returnRequestId: request._id,
        },
      },
      req
    ).catch(() => null);

    const returnRequests = await ReturnRequest.find({ order: order._id }).lean();

    return res.status(201).json({
      success: true,
      message: "Đã gửi yêu cầu đổi trả",
      data: {
        returnRequest: serializeReturnRequest(request),
        returnEligibility: getReturnEligibility(order, returnRequests),
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

// POST /api/orders/:id/retry-payment - Lấy lại paymentUrl cho đơn PENDING online
router.post(
  "/:id/retry-payment",
  auth,
  paymentRetryIpLimiter,
  paymentRetryUserLimiter,
  async (req, res) => {
  try {
    const result = await orderService.retryPayment({
      orderId: req.params.id,
      userId: req.user._id,
      clientIp: getClientIp(req),
      frontendUrl: getFrontendUrl(req),
    });

    res.json({
      success: true,
      data: {
        paymentUrl: result.paymentUrl,
        transactionId: result.order.payment.providerOrderId,
        replayed: result.replayed,
      },
    });
  } catch (error) {
    const status =
      error.statusCode ||
      (error.code === "FORBIDDEN"
        ? 403
        : error.code === "PAYMENT_RETRY_IN_PROGRESS"
          ? 409
          : /không tồn tại/i.test(error.message)
            ? 404
            : 400);
    res.status(status).json({ success: false, message: error.message });
  }
  }
);

router.get("/gateway/mock", async (req, res) => {
  if (!paymentGateway.isMockEnabled()) {
    return res.status(404).json({ success: false, message: "Mock payment disabled" });
  }

  const { orderCode = "", method = "PAYMENT", txnRef = "" } = req.query;
  if (!orderCode) {
    return res.status(400).send("Missing orderCode");
  }

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[char];
    });
  const safeOrderCode = escapeHtml(orderCode);
  const safeMethod = escapeHtml(method);

  const base = `${config.apiPublicUrl.replace(/\/$/, "")}/api/orders/payment-return/mock`;
  const successUrl = new URL(base);
  successUrl.searchParams.set("orderCode", orderCode);
  successUrl.searchParams.set("method", method);
  successUrl.searchParams.set("txnRef", txnRef);
  successUrl.searchParams.set("status", "success");

  const failedUrl = new URL(base);
  failedUrl.searchParams.set("orderCode", orderCode);
  failedUrl.searchParams.set("method", method);
  failedUrl.searchParams.set("txnRef", txnRef);
  failedUrl.searchParams.set("status", "failed");

  res.type("html").send(`<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Thanh toán thử ${safeMethod}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f5f7fb; color: #172033; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { width: min(420px, 100%); background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 18px 45px rgba(15, 23, 42, .08); }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 6px 0; color: #526070; }
      .code { margin: 18px 0; padding: 12px; border-radius: 8px; background: #f1f5f9; font-family: Consolas, monospace; color: #0f172a; }
      .actions { display: grid; gap: 10px; margin-top: 20px; }
      a { display: block; text-align: center; text-decoration: none; border-radius: 8px; padding: 12px 14px; font-weight: 700; }
      .success { background: #0f766e; color: white; }
      .failed { background: white; color: #b91c1c; border: 1px solid #fecaca; }
      small { display: block; margin-top: 16px; color: #64748b; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${safeMethod} sandbox</h1>
        <p>Đây là trang thanh toán thử vì cổng thật chưa được cấu hình.</p>
        <div class="code">Đơn hàng: ${safeOrderCode}</div>
        <div class="actions">
          <a class="success" href="${successUrl.toString()}">Xác nhận thanh toán thành công</a>
          <a class="failed" href="${failedUrl.toString()}">Mô phỏng thanh toán thất bại</a>
        </div>
        <small>Khi có merchant credential thật, VNPay sẽ redirect sang trang thanh toán của VNPay thay cho màn hình này.</small>
      </section>
    </main>
  </body>
</html>`);
});

router.get("/payment-return/vnpay", async (req, res) => {
  try {
    const result = paymentGateway.verifyVnpayReturn(req.query);
    if (!result.valid) {
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "invalid"));
    }

    const orderCode = paymentGateway.extractOrderCode(result.transactionId);
    const order = await Order.findOne({ orderCode }).select(
      "+payment.attempts"
    );
    if (!order) {
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "error"));
    }
    orderService.assertPaymentCallback(order, {
      method: "VNPAY",
      providerOrderId: result.transactionId,
      amount: Number(req.query.vnp_Amount) / 100,
    });
    const isSuccess =
      req.query.vnp_ResponseCode === "00" &&
      req.query.vnp_TransactionStatus === "00";
    const status =
      order.status === Order.STATUS.REFUNDED
        ? "refunded"
        : order.status === Order.STATUS.REFUNDING
          ? "refunding"
          : order.payment?.status === Order.PAYMENT_STATUS.PAID
            ? "success"
            : isSuccess
              ? "returned"
              : "failed";
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, status));
  } catch (error) {
    console.error("[payment-return/vnpay]", error);
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "error"));
  }
});

router.get("/ipn/vnpay", async (req, res) => {
  try {
    const result = paymentGateway.verifyVnpayPayload(req.query);
    if (!result.valid) {
      return res.json({ RspCode: "97", Message: "Invalid Checksum" });
    }

    const orderCode = paymentGateway.extractOrderCode(result.transactionId);
    const order = await Order.findOne({ orderCode }).select(
      "+payment.attempts"
    );
    if (!order) {
      return res.json({ RspCode: "01", Message: "Order not found" });
    }

    let matchedAttempt;
    try {
      matchedAttempt = orderService.assertPaymentCallback(order, {
        method: "VNPAY",
        providerOrderId: result.transactionId,
        amount: Number(req.query.vnp_Amount) / 100,
      });
    } catch {
      return res.json({ RspCode: "04", Message: "Invalid amount" });
    }

    if (
      order.payment?.status === Order.PAYMENT_STATUS.PAID &&
      String(order.payment.providerOrderId || "") ===
        String(matchedAttempt.providerOrderId || "")
    ) {
      return res.json({ RspCode: "02", Message: "Order already confirmed" });
    }

    const isSuccess =
      req.query.vnp_ResponseCode === "00" &&
      req.query.vnp_TransactionStatus === "00";

    if (isSuccess) {
      await orderService.handlePaymentSuccess({
        orderCode,
        method: "VNPAY",
        providerOrderId: result.transactionId,
        transactionId: req.query.vnp_TransactionNo,
        amount: Number(req.query.vnp_Amount) / 100,
        rawPayload: req.query,
      });
    } else {
      await orderService.handlePaymentFailed({
        orderCode,
        method: "VNPAY",
        providerOrderId: result.transactionId,
        amount: Number(req.query.vnp_Amount) / 100,
        reason: `VNPay response ${req.query.vnp_ResponseCode || "unknown"}`,
        rawPayload: req.query,
      });
    }

    return res.json({ RspCode: "00", Message: "Confirm Success" });
  } catch (error) {
    console.error("[ipn/vnpay]", error);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
});

router.get("/payment-return/momo", async (req, res) => {
  try {
    const result = paymentGateway.verifyMomoPayload(req.query);
    if (!result.valid) {
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "invalid"));
    }

    const orderCode = paymentGateway.extractOrderCode(result.transactionId);
    const order = await Order.findOne({ orderCode }).select(
      "+payment.attempts"
    );
    if (!order) {
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "error"));
    }
    orderService.assertPaymentCallback(order, {
      method: "MOMO",
      providerOrderId: result.transactionId,
      amount: Number(req.query.amount),
    });
    const isSuccess = Number(req.query.resultCode) === 0;
    const status =
      order.status === Order.STATUS.REFUNDED
        ? "refunded"
        : order.status === Order.STATUS.REFUNDING
          ? "refunding"
          : order.payment?.status === Order.PAYMENT_STATUS.PAID
            ? "success"
            : isSuccess
              ? "returned"
              : "failed";
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, status));
  } catch (error) {
    console.error("[payment-return/momo]", error);
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "error"));
  }
});

router.get("/payment-return/mock", async (req, res) => {
  try {
    if (!paymentGateway.isMockEnabled()) {
      return res.status(404).json({ success: false, message: "Mock payment disabled" });
    }

    const { orderCode, status = "success", txnRef } = req.query;
    if (!orderCode) {
      return res.status(400).json({ success: false, message: "Missing orderCode" });
    }

    const paymentOrder = await Order.findOne({ orderCode }).select(
      "payment orderCode totalAmount placedAt +payment.attempts"
    );
    if (!paymentOrder) {
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "error"));
    }
    try {
      orderService.assertPaymentCallback(paymentOrder, {
        method: paymentOrder.payment.method,
        providerOrderId: txnRef,
        amount: paymentOrder.totalAmount,
      });
    } catch {
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(paymentOrder, "failed"));
    }

    if (status === "success") {
      const paymentResult = await orderService.handlePaymentSuccess({
        orderCode,
        method: paymentOrder.payment.method,
        providerOrderId: txnRef,
        transactionId: txnRef,
        amount: paymentOrder.totalAmount,
        rawPayload: req.query,
      });
      return res.redirect(
        paymentGateway.buildFrontendPaymentUrl(
          paymentResult.order,
          paymentReturnStatus(paymentResult)
        )
      );
    }

    const failedOrder = await orderService.handlePaymentFailed({
      orderCode,
      method: paymentOrder.payment.method,
      providerOrderId: txnRef,
      amount: paymentOrder.totalAmount,
      reason: "Mock payment failed",
      rawPayload: req.query,
    });
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(failedOrder, "failed"));
  } catch (error) {
    console.error("[payment-return/mock]", error);
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(null, "error"));
  }
});

router.post("/webhook/momo", async (req, res) => {
  try {
    const result = paymentGateway.verifyMomoPayload(req.body);
    if (!result.valid) {
      return res.status(401).json({ success: false, message: "Invalid MoMo signature" });
    }

    const orderCode = paymentGateway.extractOrderCode(result.transactionId);
    if (Number(req.body.resultCode) === 0) {
      await orderService.handlePaymentSuccess({
        orderCode,
        method: "MOMO",
        providerOrderId: result.transactionId,
        transactionId: req.body.transId,
        amount: Number(req.body.amount),
        rawPayload: req.body,
      });
      return res.json({ success: true });
    }

    await orderService.handlePaymentFailed({
      orderCode,
      method: "MOMO",
      providerOrderId: result.transactionId,
      amount: Number(req.body.amount),
      reason: req.body.message || `MoMo result ${req.body.resultCode}`,
      rawPayload: req.body,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("[webhook/momo]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/orders/:id/cancel - Khách hủy đơn
router.post("/:id/cancel", auth, async (req, res) => {
  try {
    const { order, replayed } = await orderCancellationService.requestCustomerCancellation(
      req.params.id,
      req.user._id,
      req.body?.reason || "",
      getClientIp(req)
    );
    res.status(202).json({
      success: true,
      message: "Yêu cầu hủy đơn đang được xử lý",
      data: { order: { ...order.toObject(), id: order._id }, replayed },
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
});

// ──────────────────────────────────────────────────────────────
// Payment webhook endpoints (gọi từ cổng thanh toán)
//   - KHÔNG có `auth`: cổng thanh toán không mang JWT của user.
//   - Bảo mật bằng HMAC signature trong header x-signature.
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/orders/webhook/payment
 * Body: { orderCode, status: 'success'|'failed', transactionId, ... }
 */
router.post("/webhook/payment", async (req, res) => {
  try {
    const signature = req.header("x-signature");
    const timestamp = req.header("x-webhook-timestamp");
    const ok = paymentGateway.verifyWebhookSignature({
      payload: req.body,
      rawPayload: req.rawBody,
      signature,
      timestamp,
      secret: process.env.PAYMENT_WEBHOOK_SECRET,
    });
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const {
      orderCode,
      status,
      method,
      providerOrderId,
      transactionId,
      amount,
      reason,
    } = req.body || {};
    if (!orderCode || !status) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    if (status === "success") {
      const { order } = await orderService.handlePaymentSuccess({
        orderCode,
        method,
        providerOrderId,
        transactionId,
        amount,
        rawPayload: req.body,
      });
      return res.json({ success: true, orderStatus: order.status });
    }

    if (status === "failed") {
      const order = await orderService.handlePaymentFailed({
        orderCode,
        method,
        providerOrderId,
        amount,
        reason,
        rawPayload: req.body,
      });
      return res.json({ success: true, orderStatus: order?.status });
    }

    res.status(400).json({ success: false, message: "Unknown status" });
  } catch (error) {
    console.error("[webhook/payment]", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/orders/webhook/refund
 * Body: { orderCode, status: 'success', refundTransactionId, ... }
 *
 * The refund transaction id is the primary lookup key. `orderCode` is only a
 * guard: several independent refund businesses can belong to the same order.
 */
router.post("/webhook/refund", async (req, res) => {
  try {
    const signature = req.header("x-signature");
    const timestamp = req.header("x-webhook-timestamp");
    const ok = paymentGateway.verifyWebhookSignature({
      payload: req.body,
      rawPayload: req.rawBody,
      signature,
      timestamp,
      secret: process.env.PAYMENT_WEBHOOK_SECRET,
    });
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const { orderCode, status, refundTransactionId } = req.body || {};
    if (status !== "success") {
      return res.json({ success: true, ignored: true });
    }
    if (!orderCode || !refundTransactionId) {
      return res.status(400).json({
        success: false,
        message: "orderCode and refundTransactionId are required",
      });
    }

    const reference = String(refundTransactionId).trim();
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "refundTransactionId must not be blank",
      });
    }
    const order = await Order.findOne({ orderCode }).select(
      "_id status payment.method payment.refundTransactionId"
    );
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Resolve exactly one owner by the refund id. Never "try" all workflows:
    // doing so lets a support refund complete the whole order and manufacture
    // a RETURN_IN movement for goods that are still lost with the carrier.
    const [returnRequest, ticket] = await Promise.all([
      ReturnRequest.findOne({
        order: order._id,
        "refund.transactionId": reference,
        "refund.paymentMethod": { $in: ["VNPAY", "MOMO"] },
        "refund.status": {
          $in: [
            ReturnRequest.REFUND_STATUS.PROCESSING,
            ReturnRequest.REFUND_STATUS.COMPLETED,
          ],
        },
      }),
      SupportTicket.findOne({
        order: order._id,
        "resolution.refund.transactionId": reference,
        "resolution.refund.paymentMethod": { $in: ["VNPAY", "MOMO"] },
        "resolution.status": { $in: ["REFUND_PROCESSING", "REFUND_COMPLETED"] },
      }).select("+resolution.refund.idempotencyKey"),
    ]);
    const owners = [
      ...(["VNPAY", "MOMO"].includes(order.payment?.method) &&
      [Order.STATUS.REFUNDING, Order.STATUS.REFUNDED].includes(order.status) &&
      String(order.payment?.refundTransactionId || "") === reference
        ? [{ type: "order", record: order }]
        : []),
      ...(returnRequest ? [{ type: "return", record: returnRequest }] : []),
      ...(ticket ? [{ type: "support-ticket", record: ticket }] : []),
    ];
    if (owners.length !== 1) {
      return res.status(409).json({
        success: false,
        code:
          owners.length === 0
            ? "REFUND_OWNER_NOT_FOUND"
            : "REFUND_OWNER_AMBIGUOUS",
        message:
          owners.length === 0
            ? "Refund transaction is not registered for this order"
            : "Refund transaction matches more than one business record",
      });
    }

    const owner = owners[0];
    let changed = false;
    if (owner.type === "order") {
      const wasCompleted = owner.record.status === Order.STATUS.REFUNDED;
      await orderService.handleRefundSuccess({
        orderCode,
        refundTransactionId: reference,
        rawPayload: req.body,
      });
      changed = !wasCompleted;
    } else if (owner.type === "return") {
      const result = await completeReturnRefund({
        orderId: order._id,
        refundTransactionId: reference,
      });
      changed = Boolean(result?.changed);
    } else {
      changed = await supportResolutionService.settleProcessingRefund(
        owner.record,
        reference
      );
    }

    res.json({
      success: true,
      owner: owner.type,
      settled: changed ? [owner.type] : [],
      duplicate: !changed,
    });
  } catch (error) {
    console.error("[webhook/refund]", error);
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }
});

module.exports = router;
