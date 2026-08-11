const mongoose = require("mongoose");

// A row in the rewards catalogue: what a customer can trade points for.
//
// `voucherTemplate` is a mould, not a voucher. Each redemption mints its own
// single-use Voucher for the customer who paid the points, because Voucher has
// no owner field — a shared code would let anyone who learns it spend what
// somebody else bought.
const voucherTemplateSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["percent", "fixed"], required: true },
    scope: { type: String, enum: ["order", "shipping"], default: "order" },
    value: { type: Number, required: true, min: 0.01 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
    // How long the minted voucher stays valid, counted from the redemption.
    validDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
      validate: Number.isInteger,
    },
  },
  { _id: false }
);

const loyaltyGiftSchema = new mongoose.Schema(
  {
    // Capped at 20 rather than Voucher's 40: minted codes read
    // GIFT_<code>_<8 hex>, which must still fit Voucher.code's 40-char limit.
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[A-Z0-9_]+$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    imageUrl: { type: String, default: "", trim: true, maxlength: 2048 },

    pointsCost: {
      type: Number,
      required: true,
      min: 1,
      max: 1_000_000,
      validate: Number.isInteger,
    },
    // Lowest tier allowed to redeem this. "" means every tier qualifies.
    minTierKey: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 30,
    },

    voucherTemplate: { type: voucherTemplateSchema, required: true },

    // Total vouchers this gift may ever mint. 0 means unlimited.
    stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    issuedCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    perUserLimit: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
      validate: Number.isInteger,
    },

    active: { type: Boolean, default: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

loyaltyGiftSchema.index({ active: 1, sortOrder: 1, pointsCost: 1 });

loyaltyGiftSchema.pre("validate", function () {
  if (this.startAt && this.endAt && this.startAt >= this.endAt) {
    this.invalidate("endAt", "Ngày kết thúc phải sau ngày bắt đầu");
  }
  if (this.stock > 0 && this.issuedCount > this.stock) {
    this.invalidate("issuedCount", "Số đã phát không được vượt quá tồn kho quà");
  }
  if (
    this.voucherTemplate?.type === "percent" &&
    this.voucherTemplate.value > 100
  ) {
    this.invalidate(
      "voucherTemplate.value",
      "Voucher phần trăm không được vượt quá 100"
    );
  }
});

module.exports = mongoose.model("LoyaltyGift", loyaltyGiftSchema);
