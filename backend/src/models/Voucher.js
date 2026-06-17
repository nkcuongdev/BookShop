const mongoose = require("mongoose");
const { safeRegex } = require("../utils/security");

const voucherSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["percent", "fixed"],
      required: true,
    },
    value: { type: Number, required: true, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    usageLimit: { type: Number, required: true, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

voucherSchema.statics.search = function (q) {
  const regex = safeRegex(q);
  if (!regex) return this.find().sort({ createdAt: -1 });
  return this.find({
    $or: [{ code: regex }, { description: regex }],
  }).sort({ createdAt: -1 });
};

const Voucher = mongoose.model("Voucher", voucherSchema);
module.exports = Voucher;
