const mongoose = require("mongoose");

/**
 * One row per (cart owner, reminder stage) delivery attempt.
 *
 * `cartSignature` fingerprints the cart contents the reminder was sent for, so
 * a user who empties their cart and later fills it with different books starts
 * a fresh reminder cycle instead of being permanently suppressed by an old row.
 */
const cartReminderDeliverySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cartSignature: { type: String, required: true, maxlength: 64 },
    stage: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["pending", "processing", "completed"],
      default: "pending",
      index: true,
    },
    lockedUntil: { type: Date, default: null, index: true },
    completedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    itemCount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    emailDelivered: { type: Boolean, default: false },
    lastError: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

cartReminderDeliverySchema.index(
  { user: 1, cartSignature: 1, stage: 1 },
  { unique: true }
);
cartReminderDeliverySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model(
  "CartReminderDelivery",
  cartReminderDeliverySchema
);
