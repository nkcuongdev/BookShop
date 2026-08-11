const mongoose = require("mongoose");

const loyaltyDebtEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["ACCRUE", "SETTLE"], required: true },
    points: { type: Number, required: true, min: 1, validate: Number.isInteger },
    debtBefore: { type: Number, required: true, min: 0 },
    debtAfter: { type: Number, required: true, min: 0 },
    refType: { type: String, enum: ["Order", "Return"], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    refCode: { type: String, default: "", trim: true, maxlength: 50 },
    reason: { type: String, default: "", trim: true, maxlength: 500 },
    uniqueKey: { type: String, required: true, unique: true, select: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

loyaltyDebtEventSchema.index({ user: 1, createdAt: -1 });

function immutable() {
  throw new Error("Loyalty debt events are immutable");
}
loyaltyDebtEventSchema.pre("updateOne", immutable);
loyaltyDebtEventSchema.pre("updateMany", immutable);
loyaltyDebtEventSchema.pre("findOneAndUpdate", immutable);
loyaltyDebtEventSchema.pre("deleteOne", immutable);
loyaltyDebtEventSchema.pre("deleteMany", immutable);

module.exports = mongoose.model("LoyaltyDebtEvent", loyaltyDebtEventSchema);
