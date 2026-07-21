const mongoose = require("mongoose");

const voucherRedemptionSchema = new mongoose.Schema(
  {
    voucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
  },
  { timestamps: true }
);

voucherRedemptionSchema.index({ voucher: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("VoucherRedemption", voucherRedemptionSchema);
