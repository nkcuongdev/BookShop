const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sessionId: { type: String, default: "", index: true },
    type: {
      type: String,
      enum: [
        "product_view",
        "search",
        "add_to_cart",
        "cart_update",
        "checkout_start",
        "order_created",
        "payment_success",
      ],
      required: true,
      index: true,
    },
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", default: null, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    value: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ type: 1, createdAt: -1 });

const AnalyticsEvent = mongoose.model("AnalyticsEvent", analyticsEventSchema);
module.exports = AnalyticsEvent;
