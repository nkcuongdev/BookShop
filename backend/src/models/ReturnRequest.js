const mongoose = require("mongoose");

const RETURN_STATUS = Object.freeze({
  PENDING: "PENDING",
  // Kept for documents created before the multi-step return workflow.
  APPROVED: "APPROVED",
  RETURNING: "RETURNING",
  REJECTED: "REJECTED",
  RECEIVED: "RECEIVED",
  CLOSED: "CLOSED",
});

const RETURN_REFUND_STATUS = Object.freeze({
  NONE: "NONE",
  PENDING: "PENDING",
  // The gateway accepted the refund but has not settled it yet (VNPay can
  // answer ok without a terminal transaction status). The money is not back
  // with the customer, so the request stays open until a later poll or
  // callback confirms it.
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  MANUAL_REQUIRED: "MANUAL_REQUIRED",
});

const RETURN_REASON = Object.freeze({
  DAMAGED: "DAMAGED",
  WRONG_ITEM: "WRONG_ITEM",
  MISSING_ITEM: "MISSING_ITEM",
  QUALITY_ISSUE: "QUALITY_ISSUE",
  OTHER: "OTHER",
});

const returnItemSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    author: { type: String, default: "", trim: true, maxlength: 200 },
    imageUrl: { type: String, default: "", maxlength: 2048 },
    unitPrice: { type: Number, required: true, min: 0 },
    orderedQuantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: Number.isInteger,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: [
        { validator: Number.isInteger, message: "Return quantity must be an integer" },
        {
          validator(value) {
            return value <= this.orderedQuantity;
          },
          message: "Return quantity cannot exceed ordered quantity",
        },
      ],
    },
  },
  { _id: false }
);

const returnRequestSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [returnItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0 && items.length <= 50,
        message: "Return request must contain 1-50 items",
      },
    },
    reason: {
      type: String,
      enum: Object.values(RETURN_REASON),
      required: true,
    },
    // Who pays to ship the goods back: the shop covers it when the return is
    // caused by the shop's own mistake, the customer covers a change of mind.
    returnShippingPaidBy: {
      type: String,
      enum: ["shop", "customer"],
      default: "customer",
    },
    details: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    images: {
      type: [{ type: String, trim: true, maxlength: 2048 }],
      default: [],
      validate: {
        validator: (images) =>
          images.length <= 3 && new Set(images).size === images.length,
        message: "Return request can contain at most 3 unique images",
      },
    },
    status: {
      type: String,
      enum: Object.values(RETURN_STATUS),
      default: RETURN_STATUS.PENDING,
      index: true,
    },
    adminNote: { type: String, default: "", trim: true, maxlength: 1000 },
    returnCode: { type: String, default: "", trim: true, maxlength: 40 },
    returnInstructions: { type: String, default: "", trim: true, maxlength: 1000 },
    expectedRefundAmount: { type: Number, default: 0, min: 0 },
    inventoryDisposition: {
      type: String,
      enum: ["RESTOCK", "DAMAGED"],
      default: null,
    },
    inventoryAdjustedAt: { type: Date, default: null, select: false },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    receivedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    refund: {
      status: {
        type: String,
        enum: Object.values(RETURN_REFUND_STATUS),
        default: RETURN_REFUND_STATUS.NONE,
      },
      amount: { type: Number, default: 0, min: 0 },
      idempotencyKey: { type: String, default: "", maxlength: 250, select: false },
      transactionId: { type: String, default: "", maxlength: 250 },
      businessType: { type: String, enum: ["RETURN"], default: "RETURN" },
      sourceId: { type: String, default: "", maxlength: 50 },
      paymentMethod: { type: String, enum: ["VNPAY", "MOMO", "COD"], default: null },
      originalPaymentTransactionId: { type: String, default: "", maxlength: 250 },
      originalProviderOrderId: { type: String, default: "", maxlength: 250 },
      requestedAt: { type: Date, default: null, select: false },
      nextRetryAt: { type: Date, default: null, select: false },
      retryCount: { type: Number, default: 0, min: 0, select: false },
      lockUntil: { type: Date, default: null, select: false },
      lockToken: { type: String, default: "", maxlength: 100, select: false },
      lastError: { type: String, default: "", maxlength: 500 },
      completedAt: { type: Date, default: null },
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

returnRequestSchema.index({ status: 1, createdAt: -1 });
returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ order: 1, createdAt: -1, _id: -1 });
returnRequestSchema.index(
  { returnCode: 1 },
  { unique: true, partialFilterExpression: { returnCode: { $gt: "" } } }
);
returnRequestSchema.index({ "refund.status": 1, "refund.nextRetryAt": 1 });
returnRequestSchema.index({ "refund.transactionId": 1 });

const ReturnRequest = mongoose.model("ReturnRequest", returnRequestSchema);

ReturnRequest.STATUS = RETURN_STATUS;
ReturnRequest.REASON = RETURN_REASON;
ReturnRequest.REFUND_STATUS = RETURN_REFUND_STATUS;

module.exports = ReturnRequest;
module.exports.RETURN_STATUS = RETURN_STATUS;
module.exports.RETURN_REASON = RETURN_REASON;
module.exports.RETURN_REFUND_STATUS = RETURN_REFUND_STATUS;
