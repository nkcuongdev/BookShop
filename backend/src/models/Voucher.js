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
      minlength: 3,
      maxlength: 40,
      match: /^[A-Z0-9_]+$/,
    },
    type: {
      type: String,
      enum: ["percent", "fixed"],
      required: true,
    },
    scope: {
      type: String,
      enum: ["order", "shipping"],
      default: "order",
      required: true,
    },
    value: { type: Number, required: true, min: 0.01 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    usageLimit: {
      type: Number,
      required: true,
      min: 1,
      max: 1_000_000,
      validate: Number.isInteger,
    },
    perUserLimit: {
      type: Number,
      default: 1,
      min: 1,
      max: 1_000,
      validate: Number.isInteger,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    active: { type: Boolean, default: true },
    // Opt-in visibility keeps existing and campaign-specific codes private.
    publicVisible: { type: Boolean, default: false },
    description: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

voucherSchema.index({ publicVisible: 1, active: 1, startAt: 1, endAt: 1 });

voucherSchema.pre("validate", function () {
  if (this.type === "fixed") {
    this.maxDiscount = 0;
  }
  if (this.type === "percent" && (this.value <= 0 || this.value > 100)) {
    this.invalidate("value", "Percent voucher value must be between 0 and 100");
  }
  if (
    this.startAt instanceof Date &&
    this.endAt instanceof Date &&
    this.endAt <= this.startAt
  ) {
    this.invalidate("endAt", "Voucher endAt must be after startAt");
  }
  if (this.perUserLimit > this.usageLimit) {
    this.invalidate("perUserLimit", "Per-user limit cannot exceed usage limit");
  }
});

voucherSchema.statics.search = function (q) {
  const regex = safeRegex(q);
  if (!regex) return this.find().sort({ createdAt: -1 });
  return this.find({
    $or: [{ code: regex }, { description: regex }],
  }).sort({ createdAt: -1 });
};

const Voucher = mongoose.model("Voucher", voucherSchema);
module.exports = Voucher;
