const mongoose = require("mongoose");

// Every loyalty point movement in the system lands here, append-only.
// `User.loyalty.pointsBalance` is a snapshot of the running total; this
// collection is the audit trail that explains how the snapshot got there.
// Corrections are made with a reversing entry, never by editing or deleting.
//
// This mirrors the StockLedger <-> Book.stock pair deliberately: same shape,
// same guarantees, same reconciliation story.
const MOVEMENT_TYPES = [
  "EARN", // points granted when an order reaches DELIVERED
  "REDEEM_ORDER", // points spent at checkout to pay down an order
  "REDEEM_GIFT", // points traded for a voucher from the gift catalogue
  "REFUND_ORDER", // points handed back when an order dies before completing
  "REVOKE", // points clawed back when a delivered order is refunded
  "EXPIRE", // reserved: points are not time-limited today
  "ADJUST", // manual correction by an admin, reason required
];

// Which direction each movement is allowed to push the balance.
// 0 means the movement is legitimately two-way: an admin adjustment can add
// or subtract, and forcing it through two type names would only obscure that.
const EXPECTED_SIGN = Object.freeze({
  EARN: 1,
  REFUND_ORDER: 1,
  REDEEM_ORDER: -1,
  REDEEM_GIFT: -1,
  REVOKE: -1,
  EXPIRE: -1,
  ADJUST: 0,
});

const REF_TYPES = ["Order", "Voucher", "LoyaltyGift", "User", null];

// Snapshot of the formula in force when points were earned. Kept denormalised
// so the history screen can answer "why 47 points?" years later, and so that
// an admin editing the programme never rewrites what already happened.
const earnBasisSchema = new mongoose.Schema(
  {
    // Goods total actually paid for: net of order vouchers and of any points
    // already spent, and never including shipping.
    eligibleAmount: { type: Number, default: 0, min: 0 },
    baseRate: { type: Number, default: 0, min: 0 },
    tierKey: { type: String, default: "", trim: true, maxlength: 30 },
    tierMultiplier: { type: Number, default: 1, min: 0 },
  },
  { _id: false }
);

const loyaltyLedgerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    // Signed: positive adds points, negative removes them.
    points: {
      type: Number,
      required: true,
      validate: {
        validator: (value) => Number.isInteger(value) && value !== 0,
        message: "Loyalty ledger points must be a non-zero integer",
      },
    },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },

    earnBasis: { type: earnBasisSchema, default: undefined },

    refType: { type: String, enum: REF_TYPES, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Human-readable pointer (OD-XXXX, a voucher code) kept denormalised so
    // the history screen never needs a join to render.
    refCode: { type: String, default: "", trim: true, maxlength: 50 },
    reason: { type: String, default: "", trim: true, maxlength: 500 },
    // null means the movement was made by the system (order flow, jobs).
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Reserved for time-limited points, which are switched off today. The
    // field exists now so enabling expiry later needs no migration.
    expiresAt: { type: Date, default: null },

    // Natural key for movements that must happen at most once for a given
    // subject: "EARN:Order:<id>", "REVOKE:Order:<id>". The partial unique
    // index below turns idempotency into a database invariant rather than
    // something every call site has to remember.
    uniqueKey: { type: String, default: null, select: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

loyaltyLedgerSchema.index({ user: 1, createdAt: -1 });
loyaltyLedgerSchema.index({ user: 1, type: 1, createdAt: -1 });
loyaltyLedgerSchema.index({ refType: 1, refId: 1, type: 1 });
loyaltyLedgerSchema.index({ createdAt: -1 });
loyaltyLedgerSchema.index(
  { uniqueKey: 1 },
  {
    unique: true,
    partialFilterExpression: { uniqueKey: { $type: "string" } },
  }
);
// Only meaningful once expiry is switched on; partial so it stays empty until
// then rather than indexing a column of nulls.
loyaltyLedgerSchema.index(
  { user: 1, expiresAt: 1 },
  { partialFilterExpression: { expiresAt: { $type: "date" } } }
);

// The ledger is append-only. Throw rather than call next(err): Mongoose 7+
// invokes query middleware without a callback, so next(...) surfaces the wrong
// cause. Same reasoning as AuditLog.
function blockMutation() {
  throw new Error("Loyalty ledger entries are immutable");
}
loyaltyLedgerSchema.pre("updateOne", blockMutation);
loyaltyLedgerSchema.pre("updateMany", blockMutation);
loyaltyLedgerSchema.pre("findOneAndUpdate", blockMutation);
loyaltyLedgerSchema.pre("deleteOne", blockMutation);
loyaltyLedgerSchema.pre("deleteMany", blockMutation);

const LoyaltyLedger = mongoose.model("LoyaltyLedger", loyaltyLedgerSchema);
LoyaltyLedger.MOVEMENT_TYPES = MOVEMENT_TYPES;
LoyaltyLedger.EXPECTED_SIGN = EXPECTED_SIGN;
LoyaltyLedger.REF_TYPES = REF_TYPES;
module.exports = LoyaltyLedger;
