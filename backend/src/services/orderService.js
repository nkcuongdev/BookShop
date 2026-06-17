const Order = require("../models/Order");
const Book = require("../models/Book");
const Voucher = require("../models/Voucher");
const Promotion = require("../models/Promotion");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const paymentGateway = require("./paymentGateway");
const notificationService = require("./notificationService");

const { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHOD } = Order;

const PENDING_TTL_MS = 15 * 60 * 1000;

function notifyUserSafe(...args) {
  return notificationService.notifyUser(...args).catch(() => null);
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

// ──────────────────────────────────────────────────────────────
// Stock helpers — mô hình đơn giản: chỉ có 1 trường `stock`.
//   - Đặt đơn  → decrementStock (atomic)
//   - Hủy/Fail → incrementStock
//   - Giao thành công → tăng `sold`
// ──────────────────────────────────────────────────────────────

async function decrementStock(bookId, qty) {
  const res = await Book.updateOne(
    { _id: bookId, stock: { $gte: qty } },
    { $inc: { stock: -qty } }
  );
  return res.modifiedCount === 1;
}

async function incrementStock(bookId, qty) {
  await Book.updateOne({ _id: bookId }, { $inc: { stock: qty } });
}

async function incrementSold(bookId, qty) {
  await Book.updateOne({ _id: bookId }, { $inc: { sold: qty } });
}

async function decrementSold(bookId, qty) {
  await Book.updateOne(
    { _id: bookId, sold: { $gte: qty } },
    { $inc: { sold: -qty } }
  );
}

async function restoreItems(items) {
  for (const item of items) {
    await incrementStock(item.book, item.quantity);
  }
}

// ──────────────────────────────────────────────────────────────
// Voucher helper
// ──────────────────────────────────────────────────────────────
async function applyVoucher(code, subtotal) {
  if (!code) return { discountAmount: 0, voucher: null };

  const voucher = await Voucher.findOne({
    code: code.toUpperCase(),
    active: true,
  });
  if (!voucher) throw new Error("Voucher không tồn tại hoặc đã ngừng");

  const now = new Date();
  if (now < voucher.startAt || now > voucher.endAt)
    throw new Error("Voucher không trong thời gian hiệu lực");
  if (voucher.usedCount >= voucher.usageLimit)
    throw new Error("Voucher đã hết lượt sử dụng");
  if (subtotal < voucher.minOrder)
    throw new Error(
      `Đơn hàng tối thiểu ${voucher.minOrder.toLocaleString()}đ`
    );

  let discount =
    voucher.type === "percent"
      ? Math.floor((subtotal * voucher.value) / 100)
      : voucher.value;
  if (voucher.maxDiscount > 0 && discount > voucher.maxDiscount) {
    discount = voucher.maxDiscount;
  }
  discount = Math.min(discount, subtotal);

  return {
    discountAmount: discount,
    voucher: {
      voucherId: voucher._id,
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      discountAmount: discount,
    },
  };
}

async function consumeVoucher(voucherId) {
  const consumed = await Voucher.updateOne(
    {
      _id: voucherId,
      active: true,
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    },
    { $inc: { usedCount: 1 } }
  );
  if (consumed.modifiedCount !== 1) {
    throw new Error("Voucher đã hết lượt sử dụng");
  }
}

async function refundVoucher(voucherId) {
  if (!voucherId) return;
  await Voucher.updateOne(
    { _id: voucherId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } }
  );
}

// ──────────────────────────────────────────────────────────────
// Create order
//   - Trừ stock atomic cho từng item. Nếu fail → rollback các item đã trừ.
//   - Tạo order PENDING, TTL 15'.
// ──────────────────────────────────────────────────────────────
async function createOrder({
  userId,
  items,
  shippingAddress,
  paymentMethod = PAYMENT_METHOD.COD,
  voucherCode,
  shippingFee = 0,
  note = "",
  clientIp,
  frontendUrl,
}) {
  if (!items?.length) throw new Error("Giỏ hàng trống");
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

  const bookIds = items.map((i) => i.bookId);
  const books = await Book.find({ _id: { $in: bookIds } });
  const decoratedBooks = await Promotion.decorateBooks(books);
  const bookMap = new Map(books.map((b) => [b._id.toString(), b]));
  const decoratedBookMap = new Map(
    decoratedBooks.map((b) => [String(b._id || b.id), b])
  );

  const decremented = [];
  let voucherId = null;
  let createdOrder = null;

  try {
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const book = bookMap.get(item.bookId);
      if (!book) throw new Error(`Không tìm thấy sách: ${item.bookId}`);
      if (book.status !== "active")
        throw new Error(`Sách "${book.title}" đã ngừng bán`);

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) throw new Error(`Số lượng không hợp lệ: ${book.title}`);

      const ok = await decrementStock(book._id, qty);
      if (!ok) throw new Error(`Không đủ hàng: ${book.title}`);
      decremented.push({ book: book._id, quantity: qty });

      const decoratedBook = decoratedBookMap.get(book._id.toString()) || book;
      const unitPrice = Number(decoratedBook.price) || 0;
      const lineSubtotal = unitPrice * qty;
      subtotal += lineSubtotal;
      orderItems.push({
        book: book._id,
        title: book.title,
        author: book.author,
        imageUrl: book.imageUrl,
        price: unitPrice,
        quantity: qty,
        subtotal: lineSubtotal,
      });
    }

    const { discountAmount, voucher } = await applyVoucher(
      voucherCode,
      subtotal
    );
    if (voucher) {
      voucherId = voucher.voucherId;
      await consumeVoucher(voucherId);
    }

    const totalAmount = Math.max(subtotal - discountAmount + shippingFee, 0);
    const now = new Date();

    const order = await Order.create({
      user: userId,
      items: orderItems,
      subtotal,
      discountAmount,
      shippingFee,
      totalAmount,
      voucher: voucher
        ? {
            code: voucher.code,
            type: voucher.type,
            value: voucher.value,
            discountAmount: voucher.discountAmount,
          }
        : null,
      status: ORDER_STATUS.PENDING,
      shippingAddress,
      note,
      payment: {
        method: normalizedPaymentMethod,
        status: PAYMENT_STATUS.UNPAID,
        frontendReturnUrl: frontendUrl || "",
      },
      placedAt: now,
      expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
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
    createdOrder = order;

    let paymentUrl = null;
    const needsGateway =
      order.payment.method && order.payment.method !== PAYMENT_METHOD.COD;
    if (needsGateway) {
      const result = await paymentGateway.createPaymentUrl({
        orderCode: order.orderCode,
        amount: order.totalAmount,
        method: order.payment.method,
        clientIp,
        frontendUrl: order.payment.frontendReturnUrl,
      });
      paymentUrl = result.paymentUrl;
      order.payment.transactionId = result.transactionId;
      await order.save();
    }

    return { order, paymentUrl };
  } catch (error) {
    await restoreItems(decremented);
    await refundVoucher(voucherId);
    if (createdOrder) {
      createdOrder.applyTransition(ORDER_STATUS.FAILED, {
        by: "system",
        reason: `Order creation failed: ${error.message}`,
      });
      createdOrder.expiresAt = null;
      await createdOrder.save().catch(() => null);
    }
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────
// Payment webhooks
// ──────────────────────────────────────────────────────────────
async function handlePaymentSuccess({ orderCode, transactionId, rawPayload }) {
  const order = await Order.findOne({ orderCode });
  if (!order) throw new Error(`Order ${orderCode} không tồn tại`);
  if (order.status === ORDER_STATUS.PAID)
    return { order, alreadyProcessed: true };
  if (order.status !== ORDER_STATUS.PENDING) {
    throw new Error(
      `Không thể thanh toán, order đang ở trạng thái ${order.status}`
    );
  }

  order.applyTransition(ORDER_STATUS.PAID, {
    by: "gateway",
    reason: "Payment succeeded",
  });
  order.payment.transactionId = transactionId || order.payment.transactionId;
  order.payment.rawPayload = rawPayload || null;
  order.expiresAt = null;
  await order.save();
  await notifyUserSafe(order.user, {
    type: "payment",
    title: "Payment successful",
    message: `Payment for order ${order.orderCode} was completed.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  await AnalyticsEvent.create({
    user: order.user,
    type: "payment_success",
    order: order._id,
    value: order.totalAmount,
    metadata: { orderCode: order.orderCode, transactionId },
  }).catch(() => null);
  return { order, alreadyProcessed: false };
}

async function handlePaymentFailed({ orderCode, reason, rawPayload }) {
  const order = await Order.findOne({ orderCode });
  if (!order) throw new Error(`Order ${orderCode} không tồn tại`);
  if (order.status !== ORDER_STATUS.PENDING) return order;

  await restoreItems(order.items);
  order.applyTransition(ORDER_STATUS.FAILED, {
    by: "gateway",
    reason: reason || "Payment failed",
  });
  order.payment.rawPayload = rawPayload || null;
  order.expiresAt = null;
  await order.save();
  await notifyUserSafe(order.user, {
    type: "payment",
    title: "Payment failed",
    message: `Payment for order ${order.orderCode} failed.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

// ──────────────────────────────────────────────────────────────
// Admin actions
// ──────────────────────────────────────────────────────────────
async function adminApproveOrder(orderId, adminId) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order không tồn tại");
  const isCOD = order.payment.method === PAYMENT_METHOD.COD;
  if (isCOD) {
    if (order.status !== ORDER_STATUS.PENDING)
      throw new Error(`Không thể xác nhận, status = ${order.status}`);
  } else if (order.status !== ORDER_STATUS.PAID) {
    throw new Error(
      `Đơn online cần thanh toán thành công trước khi duyệt, status = ${order.status}`
    );
  }

  order.applyTransition(ORDER_STATUS.PROCESSING, {
    by: `admin:${adminId}`,
    reason: isCOD ? "COD confirmed" : "Online payment approved",
  });
  order.expiresAt = null;
  await order.save();
  await notifyUserSafe(order.user, {
    type: "order",
    title: "Order confirmed",
    message: `Order ${order.orderCode} is being processed.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

const adminConfirmCOD = adminApproveOrder;

async function adminMarkShipped(orderId, adminId, tracking = {}) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order không tồn tại");
  if (tracking.carrier) order.carrier = String(tracking.carrier).trim();
  if (tracking.trackingNumber) {
    order.trackingNumber = String(tracking.trackingNumber).trim();
  }
  if (tracking.estimatedDelivery) {
    const d = new Date(tracking.estimatedDelivery);
    if (!Number.isNaN(d.getTime())) order.estimatedDelivery = d;
  }
  order.applyTransition(ORDER_STATUS.SHIPPED, {
    by: `admin:${adminId}`,
    reason: "Handed to carrier",
  });
  order.trackingEvents.push({
    status: "SHIPPED",
    description: "Order handed to carrier",
    at: new Date(),
  });
  await order.save();
  await notifyUserSafe(order.user, {
    type: "shipping",
    title: "Order shipped",
    message: `Order ${order.orderCode} is on the way.`,
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
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order không tồn tại");
  order.applyTransition(ORDER_STATUS.DELIVERED, {
    by: `admin:${adminId}`,
    reason: "Delivered to customer",
  });
  await order.save();

  for (const item of order.items) {
    await incrementSold(item.book, item.quantity);
  }
  order.trackingEvents.push({
    status: "DELIVERED",
    description: "Order delivered to customer",
    at: new Date(),
  });
  await order.save();
  await notifyUserSafe(order.user, {
    type: "shipping",
    title: "Order delivered",
    message: `Order ${order.orderCode} has been delivered.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

// ──────────────────────────────────────────────────────────────
// Cancel / Refund
// ──────────────────────────────────────────────────────────────
async function cancelOrder(orderId, userId, reason = "") {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order không tồn tại");
  if (order.user.toString() !== userId.toString())
    throw new Error("Không có quyền hủy đơn này");

  const s = order.status;
  const terminal = [
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.REFUNDED,
    ORDER_STATUS.REFUNDING,
    ORDER_STATUS.FAILED,
  ];
  if (terminal.includes(s))
    throw new Error(`Không thể hủy đơn ở trạng thái ${s}`);

  // Case 1: đơn chưa thanh toán online (PENDING hoặc COD-PROCESSING) → hủy luôn
  const isCodProcessing =
    order.payment.method === PAYMENT_METHOD.COD &&
    s === ORDER_STATUS.PROCESSING;
  if (s === ORDER_STATUS.PENDING || isCodProcessing) {
    await restoreItems(order.items);
    order.applyTransition(ORDER_STATUS.CANCELLED, {
      by: "user",
      reason: reason || "Cancelled by customer",
    });
    order.expiresAt = null;
    await order.save();
    await notifyUserSafe(order.user, {
      type: "order",
      title: "Order cancelled",
      message: `Order ${order.orderCode} was cancelled.`,
      link: `/profile/orders/${order._id}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
    return order;
  }

  // Case 2: đã thanh toán online → yêu cầu refund
  if (s === ORDER_STATUS.PAID || s === ORDER_STATUS.PROCESSING) {
    const gw = await paymentGateway.requestRefund({
      transactionId: order.payment.transactionId,
      amount: order.totalAmount,
      reason,
    });
    if (!gw.ok) {
      throw new Error(gw.error || "Khong tao duoc yeu cau hoan tien");
    }

    order.applyTransition(ORDER_STATUS.REFUNDING, {
      by: "user",
      reason: reason || "Customer requested refund",
    });
    order.payment.refundTransactionId = gw.refundTransactionId;
    await order.save();
    await notifyUserSafe(order.user, {
      type: "refund",
      title: "Refund requested",
      message: `Refund for order ${order.orderCode} is being processed.`,
      link: `/profile/orders/${order._id}`,
      metadata: { orderId: order._id, orderCode: order.orderCode },
    });
    return order;
  }

  throw new Error(`Không thể hủy đơn ở trạng thái ${s}`);
}

async function handleRefundSuccess({
  orderCode,
  refundTransactionId,
  rawPayload,
}) {
  const order = await Order.findOne({ orderCode });
  if (!order) throw new Error(`Order ${orderCode} không tồn tại`);
  if (order.status === ORDER_STATUS.REFUNDED) return order;
  if (order.status !== ORDER_STATUS.REFUNDING) {
    throw new Error(
      `Order ${orderCode} không ở trạng thái REFUNDING (hiện: ${order.status})`
    );
  }

  await restoreItems(order.items);
  // Nếu đơn đã DELIVERED trước đó (đã tăng sold), trừ sold lại
  if (order.deliveredAt) {
    for (const item of order.items) {
      await decrementSold(item.book, item.quantity);
    }
  }

  order.applyTransition(ORDER_STATUS.REFUNDED, {
    by: "gateway",
    reason: "Refund succeeded",
  });
  order.payment.refundTransactionId =
    refundTransactionId || order.payment.refundTransactionId;
  order.payment.rawPayload = rawPayload || order.payment.rawPayload;
  await order.save();
  await notifyUserSafe(order.user, {
    type: "refund",
    title: "Refund completed",
    message: `Refund for order ${order.orderCode} has been completed.`,
    link: `/profile/orders/${order._id}`,
    metadata: { orderId: order._id, orderCode: order.orderCode },
  });
  return order;
}

// ──────────────────────────────────────────────────────────────
// TTL job: PENDING quá 15' → CANCELLED + trả stock
// ──────────────────────────────────────────────────────────────
async function expirePendingOrders() {
  const expired = await Order.find({
    status: ORDER_STATUS.PENDING,
    expiresAt: { $lte: new Date() },
  }).limit(100);

  const results = [];
  for (const pending of expired) {
    try {
      const order = await Order.findById(pending._id);
      if (!order || order.status !== ORDER_STATUS.PENDING) continue;
      await restoreItems(order.items);
      order.applyTransition(ORDER_STATUS.CANCELLED, {
        by: "system",
        reason: "Auto-cancel: PENDING timed out (15')",
      });
      order.expiresAt = null;
      await order.save();
      await notifyUserSafe(order.user, {
        type: "order",
        title: "Order expired",
        message: `Order ${order.orderCode} was cancelled because payment timed out.`,
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

module.exports = {
  createOrder,
  handlePaymentSuccess,
  handlePaymentFailed,
  adminApproveOrder,
  adminConfirmCOD,
  adminMarkShipped,
  adminMarkDelivered,
  cancelOrder,
  handleRefundSuccess,
  expirePendingOrders,
  applyVoucher,
  PENDING_TTL_MS,
};
