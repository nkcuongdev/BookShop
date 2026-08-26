const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    from: { type: String, enum: ["customer", "admin"], required: true },
    text: { type: String, required: true, maxlength: 2000 },
    automated: { type: Boolean, default: false },
    automationType: {
      type: String,
      enum: ["faq", "greeting", "fallback", "handoff"],
      default: undefined,
    },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, _id: -1 });

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;
