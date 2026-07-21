const mongoose = require("mongoose");

const STATUS = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
});

const TYPE = Object.freeze({
  SHIPMENT_CANCEL_REQUESTED: "SHIPMENT_CANCEL_REQUESTED",
});

const orderOutboxEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(TYPE), required: true },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.PENDING,
      index: true,
    },
    payload: {
      previousStatus: { type: String, required: true, maxlength: 50 },
      requestedBy: { type: String, required: true, maxlength: 150 },
      reason: { type: String, default: "", maxlength: 500 },
      clientIp: { type: String, default: "", maxlength: 100 },
    },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockUntil: { type: Date, default: null },
    lockToken: { type: String, default: "", maxlength: 100 },
    lastError: { type: String, default: "", maxlength: 500 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderOutboxEventSchema.index({ status: 1, nextAttemptAt: 1, lockUntil: 1 });

const OrderOutboxEvent = mongoose.model(
  "OrderOutboxEvent",
  orderOutboxEventSchema
);
OrderOutboxEvent.STATUS = STATUS;
OrderOutboxEvent.TYPE = TYPE;

module.exports = OrderOutboxEvent;
