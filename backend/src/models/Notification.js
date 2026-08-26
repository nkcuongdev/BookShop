const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    // Broadcast audience: "user", "all", or a staff role key. Not an enum
    // because roles are created at runtime; notificationService.notifyRole is
    // the only writer of a role-targeted value and validates it there.
    role: { type: String, default: "user", index: true },
    type: {
      type: String,
      enum: [
        "order",
        "payment",
        "shipping",
        "refund",
        "chat",
        "stock",
        "promotion",
        "review",
        "system",
      ],
      default: "system",
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, default: "" },
    link: { type: String, default: "" },
    readAt: { type: Date, default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });
notificationSchema.index({ role: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ role: 1, readBy: 1, createdAt: -1 });
notificationSchema.index({ role: 1, type: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
