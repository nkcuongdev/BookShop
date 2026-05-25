const express = require("express");
const Order = require("../models/Order");
const config = require("../config");
const orderService = require("../services/orderService");
const paymentGateway = require("../services/paymentGateway");
const { auth } = require("../middleware/auth");

const router = express.Router();

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

// ──────────────────────────────────────────────────────────────
// Customer endpoints
// ──────────────────────────────────────────────────────────────

// POST /api/orders - Tạo đơn (soft-booking)
router.post("/", auth, async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod,
      voucherCode,
      shippingFee,
      note,
    } = req.body;

    if (
      !shippingAddress?.fullName ||
      !shippingAddress?.phone ||
      !shippingAddress?.address
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin giao hàng",
      });
    }

    const { order, paymentUrl } = await orderService.createOrder({
      userId: req.user._id,
      items,
      shippingAddress,
      paymentMethod,
      voucherCode,
      shippingFee,
      note,
      clientIp: getClientIp(req),
      frontendUrl: getFrontendUrl(req),
    });

    res.status(201).json({
      success: true,
      message: "Đặt hàng thành công",
      data: {
        order: { ...order.toObject(), id: order._id },
        paymentUrl,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/orders - Orders của user hiện tại
router.get("/", auth, async (req, res) => {
  try {
    const orders = await Order.getByUser(req.user._id);
    res.json({
      success: true,
      data: {
        orders: orders.map((o) => ({ ...o.toObject(), id: o._id })),
        count: orders.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/orders/:id - Chi tiết 1 đơn
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
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền truy cập" });
    }
    res.json({
      success: true,
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/orders/:id/retry-payment - Lấy lại paymentUrl cho đơn PENDING online
router.post("/:id/retry-payment", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng" });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền truy cập" });
    }
    if (order.status !== Order.STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        message: `Đơn không ở trạng thái chờ thanh toán (${order.status})`,
      });
    }
    if (order.payment?.method === Order.PAYMENT_METHOD.COD) {
      return res
        .status(400)
        .json({ success: false, message: "Đơn COD không cần thanh toán online" });
    }

    const result = await paymentGateway.createPaymentUrl({
      orderCode: order.orderCode,
      amount: order.totalAmount,
      method: order.payment.method,
      clientIp: getClientIp(req),
      frontendUrl: order.payment?.frontendReturnUrl || getFrontendUrl(req),
    });
    order.payment.transactionId = result.transactionId;
    await order.save();

    res.json({
      success: true,
      data: {
        paymentUrl: result.paymentUrl,
        transactionId: result.transactionId,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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
    const isSuccess =
      req.query.vnp_ResponseCode === "00" &&
      req.query.vnp_TransactionStatus === "00";

    if (isSuccess) {
      const { order } = await orderService.handlePaymentSuccess({
        orderCode,
        transactionId: req.query.vnp_TransactionNo || result.transactionId,
        rawPayload: req.query,
      });
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, "success"));
    }

    const order = await orderService.handlePaymentFailed({
      orderCode,
      reason: `VNPay response ${req.query.vnp_ResponseCode || "unknown"}`,
      rawPayload: req.query,
    });
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, "failed"));
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
    const order = await Order.findOne({ orderCode });
    if (!order) {
      return res.json({ RspCode: "01", Message: "Order not found" });
    }

    const expectedAmount = Math.round(Number(order.totalAmount) * 100);
    const receivedAmount = Math.round(Number(req.query.vnp_Amount));
    if (expectedAmount !== receivedAmount) {
      return res.json({ RspCode: "04", Message: "Invalid amount" });
    }

    if (order.payment?.status === Order.PAYMENT_STATUS.PAID) {
      return res.json({ RspCode: "02", Message: "Order already confirmed" });
    }

    const isSuccess =
      req.query.vnp_ResponseCode === "00" &&
      req.query.vnp_TransactionStatus === "00";

    if (isSuccess) {
      await orderService.handlePaymentSuccess({
        orderCode,
        transactionId: req.query.vnp_TransactionNo || result.transactionId,
        rawPayload: req.query,
      });
    } else {
      await orderService.handlePaymentFailed({
        orderCode,
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
    const isSuccess = Number(req.query.resultCode) === 0;

    if (isSuccess) {
      const { order } = await orderService.handlePaymentSuccess({
        orderCode,
        transactionId: req.query.transId || result.transactionId,
        rawPayload: req.query,
      });
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, "success"));
    }

    const order = await orderService.handlePaymentFailed({
      orderCode,
      reason: req.query.message || `MoMo result ${req.query.resultCode}`,
      rawPayload: req.query,
    });
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, "failed"));
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

    if (status === "success") {
      const { order } = await orderService.handlePaymentSuccess({
        orderCode,
        transactionId: txnRef,
        rawPayload: req.query,
      });
      return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, "success"));
    }

    const order = await orderService.handlePaymentFailed({
      orderCode,
      reason: "Mock payment failed",
      rawPayload: req.query,
    });
    return res.redirect(paymentGateway.buildFrontendPaymentUrl(order, "failed"));
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
        transactionId: req.body.transId || result.transactionId,
        rawPayload: req.body,
      });
      return res.json({ success: true });
    }

    await orderService.handlePaymentFailed({
      orderCode,
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
    const order = await orderService.cancelOrder(
      req.params.id,
      req.user._id,
      req.body?.reason || ""
    );
    res.json({
      success: true,
      message:
        order.status === Order.STATUS.REFUNDING
          ? "Đã yêu cầu hoàn tiền, đang xử lý"
          : "Đã hủy đơn hàng",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
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
    const ok = paymentGateway.verifyWebhookSignature({
      payload: req.body,
      signature,
      secret: process.env.PAYMENT_WEBHOOK_SECRET,
    });
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const { orderCode, status, transactionId, reason } = req.body || {};
    if (!orderCode || !status) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    if (status === "success") {
      const { order } = await orderService.handlePaymentSuccess({
        orderCode,
        transactionId,
        rawPayload: req.body,
      });
      return res.json({ success: true, orderStatus: order.status });
    }

    if (status === "failed") {
      const order = await orderService.handlePaymentFailed({
        orderCode,
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
 */
router.post("/webhook/refund", async (req, res) => {
  try {
    const signature = req.header("x-signature");
    const ok = paymentGateway.verifyWebhookSignature({
      payload: req.body,
      signature,
      secret: process.env.PAYMENT_WEBHOOK_SECRET,
    });
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const { orderCode, status, refundTransactionId } = req.body || {};
    if (status !== "success") {
      return res.json({ success: true, ignored: true });
    }

    const order = await orderService.handleRefundSuccess({
      orderCode,
      refundTransactionId,
      rawPayload: req.body,
    });
    res.json({ success: true, orderStatus: order?.status });
  } catch (error) {
    console.error("[webhook/refund]", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
