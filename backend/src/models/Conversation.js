const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // Fallback customer info (when user is not logged in)
    customerName: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    lastMessage: { type: String, default: "" },
    lastAt: { type: Date, default: Date.now },
    unread: { type: Number, default: 0 },
    unreadCustomer: { type: Number, default: 0 },
    needsHuman: { type: Boolean, default: false },
  },
  { timestamps: true }
);

conversationSchema.index({ lastAt: -1, _id: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
module.exports = Conversation;
