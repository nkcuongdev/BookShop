const mongoose = require("mongoose");

const newsletterSubscriptionSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    status: {
      type: String,
      enum: ["pending", "active", "unsubscribed"],
      default: "pending",
      index: true,
    },
    confirmationTokenHash: { type: String, default: null, select: false },
    confirmationExpiresAt: { type: Date, default: null, select: false },
    confirmedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
    consentVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    source: { type: String, default: "footer", maxlength: 50 },
  },
  { timestamps: true }
);

newsletterSubscriptionSchema.index(
  { confirmationTokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { confirmationTokenHash: { $type: "string" } },
  }
);

module.exports = mongoose.model(
  "NewsletterSubscription",
  newsletterSubscriptionSchema
);
