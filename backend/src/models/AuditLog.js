const mongoose = require("mongoose");

/**
 * Append-only record of privileged admin actions.
 *
 * Scope is deliberately narrow: only the operations where "who did this, and
 * what did it look like before?" is a question someone will actually have to
 * answer — money, stock, order state, and account access. Ordinary CRUD stays
 * out, otherwise the log becomes noise nobody reads.
 *
 * This complements rather than replaces the domain trails that already exist.
 * StockLedger remains the authority on stock movement and Order.statusHistory
 * on order state; this collection is the one place a reviewer can answer
 * "what did this admin touch?" across all of them.
 */

const ACTIONS = Object.freeze({
  BOOK_PRICE_UPDATE: "BOOK_PRICE_UPDATE",
  BOOK_STOCK_ADJUST: "BOOK_STOCK_ADJUST",
  ORDER_STATUS_CHANGE: "ORDER_STATUS_CHANGE",
  REFUND_APPROVE: "REFUND_APPROVE",
  REFUND_REJECT: "REFUND_REJECT",
  USER_STATUS_CHANGE: "USER_STATUS_CHANGE",
  USER_ROLE_CHANGE: "USER_ROLE_CHANGE",
  LOYALTY_POINTS_ADJUST: "LOYALTY_POINTS_ADJUST",
  LOYALTY_PROGRAM_UPDATE: "LOYALTY_PROGRAM_UPDATE",
  LOYALTY_GIFT_UPDATE: "LOYALTY_GIFT_UPDATE",
});

// Which business area each action belongs to. Drives the filter chips in the
// admin UI so the list can be narrowed without knowing every action key.
const CATEGORIES = Object.freeze({
  CATALOG: "CATALOG",
  INVENTORY: "INVENTORY",
  ORDER: "ORDER",
  REFUND: "REFUND",
  ACCOUNT: "ACCOUNT",
  LOYALTY: "LOYALTY",
});

const ACTION_CATEGORY = Object.freeze({
  [ACTIONS.BOOK_PRICE_UPDATE]: CATEGORIES.CATALOG,
  [ACTIONS.BOOK_STOCK_ADJUST]: CATEGORIES.INVENTORY,
  [ACTIONS.ORDER_STATUS_CHANGE]: CATEGORIES.ORDER,
  [ACTIONS.REFUND_APPROVE]: CATEGORIES.REFUND,
  [ACTIONS.REFUND_REJECT]: CATEGORIES.REFUND,
  [ACTIONS.USER_STATUS_CHANGE]: CATEGORIES.ACCOUNT,
  [ACTIONS.USER_ROLE_CHANGE]: CATEGORIES.ACCOUNT,
  [ACTIONS.LOYALTY_POINTS_ADJUST]: CATEGORIES.LOYALTY,
  [ACTIONS.LOYALTY_PROGRAM_UPDATE]: CATEGORIES.LOYALTY,
  [ACTIONS.LOYALTY_GIFT_UPDATE]: CATEGORIES.LOYALTY,
});

const TARGET_TYPES = [
  "Book",
  "Order",
  "User",
  "ReturnRequest",
  "LoyaltyProgram",
  "LoyaltyGift",
];

// One before/after pair. Values are stringified at write time: the log has to
// render years from now, when the shape of the source document may have moved
// on, so it stores presentation-ready text rather than live references.
const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true, maxlength: 80 },
    // Vietnamese label for the field, so the UI needs no translation table.
    label: { type: String, default: "", trim: true, maxlength: 120 },
    before: { type: String, default: "", maxlength: 500 },
    after: { type: String, default: "", maxlength: 500 },
  },
  { _id: false }
);

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: Object.values(ACTIONS), required: true },
    category: { type: String, enum: Object.values(CATEGORIES), required: true },

    // Who did it. Kept as a reference for joins, plus a denormalised snapshot
    // so the entry still reads correctly after the account is renamed or
    // deleted — the whole point of an audit trail.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorName: { type: String, default: "", trim: true, maxlength: 200 },
    actorEmail: { type: String, default: "", trim: true, maxlength: 200 },
    actorRole: { type: String, default: "", trim: true, maxlength: 60 },

    // What it was done to. Same denormalisation rationale as the actor.
    targetType: { type: String, enum: TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Human-readable pointer: book title, DH000123, customer email.
    targetLabel: { type: String, default: "", trim: true, maxlength: 300 },

    changes: { type: [changeSchema], default: [] },
    reason: { type: String, default: "", trim: true, maxlength: 500 },

    // Request provenance. Useful when an account is suspected of being
    // compromised and you need to tell sessions apart.
    ip: { type: String, default: "", trim: true, maxlength: 64 },
    userAgent: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The list screen is "newest first", optionally narrowed by actor, category,
// action, or target. Each index below backs one of those filter shapes.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// Append-only, for the same reason StockLedger is: a trail that can be edited
// is not evidence. Guard the mutation entry points so a stray call fails loudly.
//
// Throwing rather than calling next(err): query middleware in Mongoose 7+ is
// invoked without a callback, so a next(...) style guard rejects with
// "next is not a function" — it still blocks, but reports the wrong reason.
function blockMutation() {
  throw new Error("Audit log entries are immutable");
}
auditLogSchema.pre("updateOne", blockMutation);
auditLogSchema.pre("updateMany", blockMutation);
auditLogSchema.pre("findOneAndUpdate", blockMutation);
auditLogSchema.pre("deleteOne", blockMutation);
auditLogSchema.pre("deleteMany", blockMutation);

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
AuditLog.ACTIONS = ACTIONS;
AuditLog.CATEGORIES = CATEGORIES;
AuditLog.ACTION_CATEGORY = ACTION_CATEGORY;
AuditLog.TARGET_TYPES = TARGET_TYPES;
module.exports = AuditLog;
