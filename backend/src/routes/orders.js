const express = require("express");
const Order = require("../models/Order");
const orderService = require("../services/orderService");
const paymentGateway = require("../services/paymentGateway");
const { auth } = require("../middleware/auth");

const router = express.Router();

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
router.get("/:id", auth, async (req, res) => {
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
