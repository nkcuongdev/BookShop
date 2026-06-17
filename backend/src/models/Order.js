const mongoose = require("mongoose");

/**
 * ORDER STATE MACHINE
 *
 *   PENDING ──(online paid)──▶ PAID ──▶ PROCESSING ──▶ SHIPPED ──▶ DELIVERED
 *      │                         │                                      │
 *      │                         └──(user cancel/refund)──▶ REFUNDING ──▶ REFUNDED
 *      │
 *      ├──(admin confirm COD)────────▶ PROCESSING ──▶ SHIPPED ──▶ DELIVERED
 *      │
 *      ├──(TTL 15' / user cancel)──▶ CANCELLED
 *      │
 *      └──(webhook fail)───────────▶ FAILED
 */

const ORDER_STATUS = Object.freeze({
  PENDING: "PENDING",
  PAID: "PAID",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
  REFUNDING: "REFUNDING",
  REFUNDED: "REFUNDED",
});

const PAYMENT_STATUS = Object.freeze({
  UNPAID: "UNPAID",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDING: "REFUNDING",
  REFUNDED: "REFUNDED",
});

const PAYMENT_METHOD = Object.freeze({
  COD: "COD",
  VNPAY: "VNPAY",
  MOMO: "MOMO",
});

// Allowed transitions: from -> [to, to, ...]
const TRANSITIONS = {
  PENDING: ["PAID", "PROCESSING", "CANCELLED", "FAILED"],
  PAID: ["PROCESSING", "REFUNDING"],
  PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDING"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDING"],
  REFUNDING: ["REFUNDED", "PAID"],
  CANCELLED: [],
  FAILED: [],
  REFUNDED: [],
};

// Stock is "reserved" (soft-booked) while order is in these states
const RESERVED_STATES = new Set(["PENDING"]);
// Stock is "committed" (deducted from actual_stock) in these states
const COMMITTED_STATES = new Set([
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "REFUNDING",
]);

const orderItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    // Price snapshot captured at the moment the order is placed
    title: { type: String, required: true },
    author: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, default: "" },
    district: { type: String, default: "" },
    ward: { type: String, default: "" },
  },
  { _id: false }
);

const voucherSnapshotSchema = new mongoose.Schema(
  {
    code: String,
    type: { type: String, enum: ["percent", "fixed"] },
    value: Number,
    discountAmount: Number,
  },
  { _id: false }
);

const paymentInfoSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      default: PAYMENT_METHOD.COD,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
    },
    // Gateway-returned transaction id (e.g. VNPay TxnRef)
    transactionId: { type: String, default: "" },
    frontendReturnUrl: { type: String, default: "" },
    // Id returned by the refund API call
    refundTransactionId: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    // Raw gateway payload, useful for auditing/debugging
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const historyEntrySchema = new mongoose.Schema(
  {
    from: String,
    to: String,
    by: { type: String, default: "system" }, // "system" | "user" | "admin" | "gateway"
    reason: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const trackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    description: { type: String, default: "" },
    location: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderCode: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [orderItemSchema], required: true },

    // Money
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    voucher: { type: voucherSnapshotSchema, default: null },

    // State machine
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },

    // Shipping
    shippingAddress: { type: shippingAddressSchema, required: true },
    note: { type: String, default: "" },
    carrier: { type: String, default: "" },
    trackingNumber: { type: String, default: "" },
    estimatedDelivery: { type: Date, default: null },
    trackingEvents: { type: [trackingEventSchema], default: [] },

    // Payment
    payment: { type: paymentInfoSchema, default: () => ({}) },

    // TTL for PENDING orders (auto-cancel after 15')
    expiresAt: { type: Date, default: null, index: true },

    // Timeline
    placedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },

    cancelReason: { type: String, default: "" },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true }
);

// Auto generate orderCode
orderSchema.pre("validate", function () {
  if (!this.orderCode) {
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.orderCode = `OD-${ts}-${rnd}`;
  }
});

// ──────────────────────────────────────────────────────────────
// State machine helpers
// ──────────────────────────────────────────────────────────────
orderSchema.statics.STATUS = ORDER_STATUS;
orderSchema.statics.PAYMENT_STATUS = PAYMENT_STATUS;
orderSchema.statics.PAYMENT_METHOD = PAYMENT_METHOD;
orderSchema.statics.TRANSITIONS = TRANSITIONS;
orderSchema.statics.RESERVED_STATES = RESERVED_STATES;
orderSchema.statics.COMMITTED_STATES = COMMITTED_STATES;

orderSchema.methods.canTransitionTo = function (next) {
  const allowed = TRANSITIONS[this.status] || [];
  return allowed.includes(next);
};

orderSchema.methods.applyTransition = function (
  next,
  { by = "system", reason = "" } = {}
) {
  if (!this.canTransitionTo(next)) {
    const err = new Error(
      `Invalid state transition: ${this.status} -> ${next}`
    );
    err.code = "INVALID_TRANSITION";
    throw err;
  }

  const from = this.status;
  this.status = next;
  this.history.push({ from, to: next, by, reason, at: new Date() });

  const now = new Date();
  switch (next) {
    case ORDER_STATUS.PAID:
      this.paidAt = now;
      this.payment.status = PAYMENT_STATUS.PAID;
      this.payment.paidAt = now;
      break;
    case ORDER_STATUS.PROCESSING:
      this.processingAt = now;
      break;
    case ORDER_STATUS.SHIPPED:
      this.shippedAt = now;
      break;
    case ORDER_STATUS.DELIVERED:
      this.deliveredAt = now;
      if (this.payment.method === PAYMENT_METHOD.COD) {
        this.payment.status = PAYMENT_STATUS.PAID;
        this.payment.paidAt = now;
        this.paidAt = now;
      }
      break;
    case ORDER_STATUS.CANCELLED:
      this.cancelledAt = now;
      this.cancelReason = reason || this.cancelReason;
      break;
    case ORDER_STATUS.FAILED:
      this.payment.status = PAYMENT_STATUS.FAILED;
      break;
    case ORDER_STATUS.REFUNDING:
      this.payment.status = PAYMENT_STATUS.REFUNDING;
      break;
    case ORDER_STATUS.REFUNDED:
      this.refundedAt = now;
      this.payment.status = PAYMENT_STATUS.REFUNDED;
      this.payment.refundedAt = now;
      break;
    default:
      break;
  }
};

// ──────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────
orderSchema.statics.getByUser = function (userId) {
  return this.find({ user: userId }).sort({ createdAt: -1 });
};

orderSchema.statics.getAllWithPagination = async function (options = {}) {
  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = {};
  if (options.status) filter.status = options.status;

  const [orders, total] = await Promise.all([
    this.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments(filter),
  ]);

  return { orders, total, page, totalPages: Math.ceil(total / limit) };
};

orderSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: {
          $sum: {
            $cond: [
              { $in: ["$status", ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]] },
              "$totalAmount",
              0,
            ],
          },
        },
        avgOrderValue: { $avg: "$totalAmount" },
      },
    },
  ]);

  const statusCounts = await this.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  return {
    totalOrders: stats[0]?.totalOrders || 0,
    totalRevenue: stats[0]?.totalRevenue || 0,
    avgOrderValue: stats[0]?.avgOrderValue || 0,
    statusCounts: statusCounts.reduce(
      (acc, s) => ({ ...acc, [s._id]: s.count }),
      {}
    ),
  };
};

orderSchema.statics.hasUserPurchasedBook = async function (userId, bookId) {
  const userKey = String(userId);
  const bookKey = String(bookId);

  const orders = await this.aggregate([
    {
      $match: {
        status: { $in: [ORDER_STATUS.DELIVERED] },
      },
    },
    {
      $addFields: {
        userKey: { $toString: "$user" },
      },
    },
    {
      $match: {
        userKey,
      },
    },
    {
      $unwind: "$items",
    },
    {
      $addFields: {
        bookKey: { $toString: "$items.book" },
      },
    },
    {
      $match: {
        bookKey,
      },
    },
    {
      $limit: 1,
    },
  ]);

  return orders.length > 0;
};

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
module.exports.ORDER_STATUS = ORDER_STATUS;
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
module.exports.PAYMENT_METHOD = PAYMENT_METHOD;
