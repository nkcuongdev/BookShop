const mongoose = require("mongoose");
const config = require("../config");

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
    dedupeKey: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ type: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: 1, type: 1, user: 1, sessionId: 1 });
analyticsEventSchema.index({ user: 1, type: 1, createdAt: -1 });
analyticsEventSchema.index({ sessionId: 1, type: 1, createdAt: -1 });
analyticsEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: config.analytics.retentionSeconds }
);
analyticsEventSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);
analyticsEventSchema.index(
  { type: 1, order: 1 },
  { unique: true, partialFilterExpression: { order: { $type: "objectId" } } }
);

const AnalyticsEvent = mongoose.model("AnalyticsEvent", analyticsEventSchema);
module.exports = AnalyticsEvent;
