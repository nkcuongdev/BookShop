const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    role: { type: String, enum: ["user", "admin", "all"], default: "user", index: true },
    type: {
      type: String,
      enum: ["order", "payment", "shipping", "refund", "chat", "system"],
      default: "system",
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, default: "" },
    link: { type: String, default: "" },
    readAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ role: 1, readAt: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
