const mongoose = require("mongoose");

const supportTicketMessageSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true,
    },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    from: { type: String, enum: ["customer", "admin"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

supportTicketMessageSchema.index({ ticket: 1, createdAt: 1, _id: 1 });

module.exports = mongoose.model("SupportTicketMessage", supportTicketMessageSchema);
