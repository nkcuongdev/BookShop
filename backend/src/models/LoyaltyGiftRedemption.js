const mongoose = require("mongoose");

// One customer's exchange of points for a minted voucher. Ties the catalogue
// row, the buyer, the voucher they received and the ledger entry that took the
// points, so support can answer "what did I get for those 500 points?".
const loyaltyGiftRedemptionSchema = new mongoose.Schema(
  {
    gift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyGift",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    voucher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      required: true,
    },
    // Denormalised so the "my rewards" list renders without a join.
    voucherCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 40,
    },
    pointsSpent: { type: Number, required: true, min: 1 },
    ledgerEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyLedger",
      required: true,
    },
    // Mirrors the minted voucher's endAt, for the same reason as voucherCode.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

loyaltyGiftRedemptionSchema.index({ user: 1, createdAt: -1 });
// Deliberately not unique: perUserLimit can exceed 1, so the per-user cap is
// enforced by counting rather than by the index.
loyaltyGiftRedemptionSchema.index({ gift: 1, user: 1 });
loyaltyGiftRedemptionSchema.index({ voucher: 1 }, { unique: true });

module.exports = mongoose.model(
  "LoyaltyGiftRedemption",
  loyaltyGiftRedemptionSchema
);
