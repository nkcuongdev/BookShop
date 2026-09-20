const mongoose = require("mongoose");

const promotionAlertDeliverySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    promotion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
      required: true,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed"],
      default: "pending",
      index: true,
    },
    lockedUntil: { type: Date, default: null, index: true },
    completedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

promotionAlertDeliverySchema.index(
  { user: 1, promotion: 1, book: 1 },
  { unique: true }
);
promotionAlertDeliverySchema.index({ promotion: 1, status: 1 });

module.exports = mongoose.model(
  "PromotionAlertDelivery",
  promotionAlertDeliverySchema
);
