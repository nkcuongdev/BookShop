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
 *      ├──(payment/COD TTL or user cancel)──▶ CANCELLED
 *      │
 *      └──(webhook fail)───────────▶ FAILED
 */

const ORDER_STATUS = Object.freeze({
  PENDING: "PENDING",
  PAID: "PAID",
  PROCESSING: "PROCESSING",
  CANCELLING: "CANCELLING",
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

const PAYMENT_ATTEMPT_STATUS = Object.freeze({
  CREATING: "CREATING",
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
});

const DUPLICATE_REFUND_STATUS = Object.freeze({
  NONE: "NONE",
  PENDING: "PENDING",
  REFUNDED: "REFUNDED",
});

// Allowed transitions: from -> [to, to, ...]
const TRANSITIONS = {
  PENDING: ["PAID", "PROCESSING", "CANCELLED", "FAILED"],
  PAID: ["PROCESSING", "CANCELLING", "REFUNDING"],
  PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDING", "CANCELLING"],
  CANCELLING: ["CANCELLED", "REFUNDING"],
  // A parcel lost or destroyed in transit never reaches DELIVERED, so it needs
  // its own route into the refund workflow.
  SHIPPED: ["DELIVERED", "REFUNDING"],
  DELIVERED: ["REFUNDING"],
  REFUNDING: ["REFUNDED", "PAID"],
  // A gateway can confirm a payment after a timeout/failure callback. In that
  // case the captured money must move directly into the refund workflow.
  CANCELLED: ["REFUNDING"],
  FAILED: ["REFUNDING"],
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

const dimensionsSchema = new mongoose.Schema(
  {
    length: { type: Number, default: null, min: 0 },
    width: { type: Number, default: null, min: 0 },
    height: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    // Price snapshot captured at the moment the order is placed
    title: { type: String, required: true },
    author: { type: String, default: "" },
    imageUrl: { type: String, default: "", maxlength: 2048 },
    category: {
      type: String,
      required: true,
      default: "uncategorized",
      trim: true,
      maxlength: 100,
    },
    price: { type: Number, required: true, min: 0 },
    // Moving-average cost at the moment the order was placed. Snapshotted so a
    // later goods receipt cannot retroactively rewrite historical margin.
    costPrice: { type: Number, default: 0, min: 0 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: Number.isInteger,
    },
    subtotal: { type: Number, required: true, min: 0 },
    weight: { type: Number, default: null, min: 0 },
    dimensions: { type: dimensionsSchema, default: () => ({}) },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    city: { type: String, default: "", trim: true, maxlength: 100 },
    district: { type: String, default: "", trim: true, maxlength: 100 },
    ward: { type: String, default: "", trim: true, maxlength: 100 },
  },
  { _id: false }
);

const voucherSnapshotSchema = new mongoose.Schema(
  {
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      select: false,
    },
    code: String,
    type: { type: String, enum: ["percent", "fixed"] },
    scope: { type: String, enum: ["order", "shipping"], default: "order" },
    value: Number,
    discountAmount: Number,
  },
  { _id: false }
);

const duplicateRefundSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(DUPLICATE_REFUND_STATUS),
      default: DUPLICATE_REFUND_STATUS.NONE,
    },
    idempotencyKey: { type: String, default: "", maxlength: 250 },
    refundTransactionId: { type: String, default: "", maxlength: 250 },
    requestedAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
    lockToken: { type: String, default: "", maxlength: 100 },
    lastError: { type: String, default: "", maxlength: 500 },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    refundedAt: { type: Date, default: null },
  },
  { _id: false }
);

const paymentAttemptSchema = new mongoose.Schema(
  {
    providerOrderId: { type: String, required: true, maxlength: 250 },
    method: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(PAYMENT_ATTEMPT_STATUS),
      default: PAYMENT_ATTEMPT_STATUS.CREATING,
    },
    checkoutUrl: { type: String, default: "", maxlength: 4096 },
    gatewayTransactionId: { type: String, default: "", maxlength: 250 },
    failureReason: { type: String, default: "", maxlength: 500 },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    duplicateRefund: {
      type: duplicateRefundSchema,
      default: () => ({}),
    },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
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
    // Compatibility snapshot of the successful/current attempt. The complete
    // immutable history lives in `attempts`.
    transactionId: { type: String, default: "" },
    providerOrderId: { type: String, default: "" },
    providerCreatedAt: { type: Date, default: null },
    attempts: {
      type: [paymentAttemptSchema],
      default: [],
      select: false,
    },
    retryLockUntil: { type: Date, default: null, select: false },
    frontendReturnUrl: { type: String, default: "" },
    // Internal checkout URL retained so an idempotent replay can return the
    // exact same payment attempt without creating a second gateway request.
    checkoutUrl: { type: String, default: "", select: false },
    // Id returned by the refund API call
    refundTransactionId: { type: String, default: "" },
    // Snapshot the complete identity of the order-level refund. This prevents
    // a callback for a return/support refund on the same order from being
    // mistaken for a full-order refund.
    refundBusinessType: { type: String, enum: ["ORDER"], default: "ORDER" },
    refundSourceId: { type: String, default: "", maxlength: 50 },
    refundAmount: { type: Number, default: 0, min: 0 },
    refundOriginalPaymentTransactionId: { type: String, default: "", maxlength: 250 },
    refundOriginalProviderOrderId: { type: String, default: "", maxlength: 250 },
    // A refund is persisted before contacting the gateway. These internal
    // fields let another worker safely resume the same idempotent request if
    // the process stops between the gateway response and the database write.
    refundIdempotencyKey: { type: String, default: "", select: false },
    refundReason: { type: String, default: "", maxlength: 500, select: false },
    refundInitiatedBy: {
      type: String,
      default: "system",
      maxlength: 150,
      select: false,
    },
    refundClientIp: { type: String, default: "", maxlength: 100, select: false },
    refundRequestedAt: { type: Date, default: null, select: false },
    refundNextRetryAt: { type: Date, default: null, select: false },
    refundRetryCount: { type: Number, default: 0, min: 0, select: false },
    refundRetryLockUntil: { type: Date, default: null, select: false },
    refundRetryLockToken: { type: String, default: "", select: false },
    refundLastError: { type: String, default: "", maxlength: 500, select: false },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    // Raw gateway payload, useful for auditing/debugging
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    refundRawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
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
    status: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 500 },
    location: { type: String, default: "", maxlength: 200 },
    providerEventKey: {
      type: String,
      default: "",
      maxlength: 64,
      select: false,
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const shipmentSimulationSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    step: { type: Number, default: 0, min: 0, max: 10 },
    nextAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastError: { type: String, default: "", maxlength: 500 },
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["manual", "ghn"], default: "manual" },
    environment: { type: String, enum: ["", "sandbox"], default: "" },
    quoteId: { type: String, default: "", maxlength: 100 },
    serviceId: { type: Number, default: null },
    serviceTypeId: { type: Number, default: null },
    serviceName: { type: String, default: "", maxlength: 100 },
    quotedFee: { type: Number, default: 0, min: 0 },
    quotedAt: { type: Date, default: null },
    providerOrderCode: { type: String, default: "", maxlength: 100 },
    providerStatus: { type: String, default: "", maxlength: 100 },
    externalCreatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    lastWebhookAt: { type: Date, default: null },
    simulation: {
      type: shipmentSimulationSchema,
      default: () => ({}),
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderCode: { type: String, unique: true, index: true },
    returnRequestGuardAt: { type: Date, default: null, select: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, trim: true, select: false },
    idempotencyHash: { type: String, select: false },
    checkoutSource: {
      type: String,
      enum: ["CART", "BUY_NOW"],
      default: "CART",
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0 && items.length <= 50,
        message: "Order must contain 1-50 items",
      },
    },

    // Money
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    shippingDiscountAmount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    voucher: { type: voucherSnapshotSchema, default: null },
    shippingVoucher: { type: voucherSnapshotSchema, default: null },
    // Loyalty points spent at checkout, and the discount they bought. The rate
    // is snapshotted so the order still renders correctly after an admin
    // retunes the programme.
    pointsRedeemed: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    pointsDiscountAmount: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    pointsRedeemRate: { type: Number, default: 0, min: 0 },
    // Points granted for this order; only meaningful once it has been delivered.
    pointsEarned: { type: Number, default: 0, min: 0, validate: Number.isInteger },

    // State machine
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },

    // Shipping
    shippingAddress: { type: shippingAddressSchema, required: true },
    shippingMethod: {
      type: String,
      enum: ["standard", "express"],
      default: "standard",
    },
    note: { type: String, default: "", maxlength: 1000 },
    carrier: { type: String, default: "", trim: true, maxlength: 100 },
    trackingNumber: { type: String, default: "", trim: true, maxlength: 100 },
    estimatedDelivery: { type: Date, default: null },
    trackingEvents: { type: [trackingEventSchema], default: [] },
    shipment: { type: shipmentSchema, default: () => ({}) },

    // Payment
    payment: { type: paymentInfoSchema, default: () => ({}) },

    // Business expiry for PENDING orders. The worker performs cancellation so
    // inventory and voucher reservations are released transactionally.
    expiresAt: { type: Date, default: null, index: true },

    // Timeline
    placedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    // Internal marker used to make stock restoration idempotent across
    // cancellation, failed payment, timeout and refund callbacks.
    inventoryRestoredAt: { type: Date, default: null, select: false },
    voucherReleasedAt: { type: Date, default: null, select: false },
    // Same idempotency markers, for the loyalty side of the order lifecycle:
    // points granted on delivery, points handed back when the order dies, and
    // points clawed back when a delivered order is refunded.
    pointsEarnedAt: { type: Date, default: null, select: false },
    pointsRefundedAt: { type: Date, default: null, select: false },
    pointsRevokedAt: { type: Date, default: null, select: false },

    cancelReason: { type: String, default: "" },
    history: { type: [historyEntrySchema], default: [] },
    supportCompensation: {
      refundedAmount: { type: Number, default: 0, min: 0 },
      reservedRefundAmount: { type: Number, default: 0, min: 0, select: false },
    },
  },
  { timestamps: true }
);

orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  }
);
orderSchema.index({ user: 1, createdAt: -1 });
// Backs the rolling-window spend aggregate behind tier evaluation.
orderSchema.index({ user: 1, status: 1, deliveredAt: -1 });
orderSchema.index({ user: 1, status: 1, "items.book": 1 });
orderSchema.index({ user: 1, status: 1, placedAt: -1 });
orderSchema.index({ user: 1, status: 1, "payment.method": 1, expiresAt: 1 });
orderSchema.index({
  "shipment.environment": 1,
  "shipment.simulation.enabled": 1,
  "shipment.simulation.nextAt": 1,
});
orderSchema.index({ "payment.status": 1, paidAt: -1 });
orderSchema.index(
  { "shipment.providerOrderCode": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "shipment.providerOrderCode": { $gt: "" },
    },
  }
);
orderSchema.index({
  "payment.attempts.duplicateRefund.status": 1,
  "payment.attempts.duplicateRefund.nextRetryAt": 1,
});
orderSchema.index({
  status: 1,
  "payment.refundTransactionId": 1,
  "payment.refundNextRetryAt": 1,
});

// Auto generate orderCode.
//
// Exported as a standalone helper because createOrder needs the code before it
// constructs the document: the loyalty ledger records it as the reference for
// the points it deducts, and that write happens while the totals are computed.
function generateOrderCode() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OD-${ts}-${rnd}`;
}

orderSchema.pre("validate", function () {
  if (!this.orderCode) {
    this.orderCode = generateOrderCode();
  }
});

// ──────────────────────────────────────────────────────────────
// State machine helpers
// ──────────────────────────────────────────────────────────────
orderSchema.statics.STATUS = ORDER_STATUS;
orderSchema.statics.PAYMENT_STATUS = PAYMENT_STATUS;
orderSchema.statics.PAYMENT_METHOD = PAYMENT_METHOD;
orderSchema.statics.PAYMENT_ATTEMPT_STATUS = PAYMENT_ATTEMPT_STATUS;
orderSchema.statics.DUPLICATE_REFUND_STATUS = DUPLICATE_REFUND_STATUS;
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
  const [totalOrders, paidStats, statusCounts] = await Promise.all([
    this.countDocuments(),
    this.aggregate([
      { $match: { "payment.status": PAYMENT_STATUS.PAID, paidAt: { $ne: null } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          avgOrderValue: { $avg: "$totalAmount" },
        },
      },
    ]),
    this.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  return {
    totalOrders,
    totalRevenue: paidStats[0]?.totalRevenue || 0,
    avgOrderValue: paidStats[0]?.avgOrderValue || 0,
    statusCounts: statusCounts.reduce(
      (acc, s) => ({ ...acc, [s._id]: s.count }),
      {}
    ),
  };
};

orderSchema.statics.hasUserPurchasedBook = async function (userId, bookId) {
  return Boolean(
    await this.exists({
      user: userId,
      status: ORDER_STATUS.DELIVERED,
      "items.book": bookId,
    })
  );
};

const Order = mongoose.model("Order", orderSchema);

Order.migrateItemCategorySnapshots = function () {
  return this.aggregate([
    { $match: { items: { $elemMatch: { category: { $exists: false } } } } },
    {
      $lookup: {
        from: "books",
        localField: "items.book",
        foreignField: "_id",
        as: "snapshotBooks",
      },
    },
    {
      $set: {
        items: {
          $map: {
            input: "$items",
            as: "item",
            in: {
              $let: {
                vars: {
                  matchedBook: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$snapshotBooks",
                          as: "book",
                          cond: { $eq: ["$$book._id", "$$item.book"] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: {
                  $mergeObjects: [
                    "$$item",
                    {
                      category: {
                        $ifNull: [
                          "$$item.category",
                          "$$matchedBook.category",
                          "uncategorized",
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    { $unset: "snapshotBooks" },
    {
      $merge: {
        into: this.collection.name,
        on: "_id",
        whenMatched: "merge",
        whenNotMatched: "discard",
      },
    },
  ]);
};
module.exports = Order;
module.exports.ORDER_STATUS = ORDER_STATUS;
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
module.exports.PAYMENT_METHOD = PAYMENT_METHOD;
module.exports.PAYMENT_ATTEMPT_STATUS = PAYMENT_ATTEMPT_STATUS;
module.exports.DUPLICATE_REFUND_STATUS = DUPLICATE_REFUND_STATUS;
module.exports.generateOrderCode = generateOrderCode;
