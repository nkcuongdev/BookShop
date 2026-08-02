const mongoose = require("mongoose");

// Every stock movement in the system lands here, append-only. `Book.stock` is a
// snapshot of the running total; this collection is the audit trail that
// explains how the snapshot got there. Corrections are made with a reversing
// entry, never by editing or deleting a row.
const MOVEMENT_TYPES = [
  "PURCHASE_IN", // goods received from a supplier
  "SALE_OUT", // committed to a customer order
  "SHIP_OUT", // reserved goods physically dispatched to the customer
  "RETURN_IN", // customer return put back on the shelf
  "CANCEL_IN", // stock put back by voiding a warehouse document
  "RESERVE_IN", // order cancelled / expired, reservation released
  "ADJUSTMENT", // manual correction with a reason
  "COUNT", // stocktake reconciliation
  "DAMAGE_OUT", // written off via a stock issue
  "TRANSFER_OUT", // issued out for any other reason (gift, sample, supplier return)
  "PURCHASE_REVERSAL", // a confirmed goods receipt cancelled, value backed out
];

// Movements that add to stock. Everything else removes from it.
//
// ADJUSTMENT is the inbound half of a manual correction; the outbound half is
// booked as TRANSFER_OUT, so a single signed delta from the admin maps onto one
// of the two. COUNT is absent because a stocktake writes its own signed row
// through setStockTo rather than going through applyMovement.
const INBOUND_TYPES = new Set([
  "PURCHASE_IN",
  "RETURN_IN",
  "CANCEL_IN",
  "RESERVE_IN",
  "ADJUSTMENT",
]);

const REF_TYPES = ["StockReceipt", "StockIssue", "StockCount", "Order", null];

const stockLedgerSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    // Signed: positive adds stock, negative removes it.
    quantity: {
      type: Number,
      required: true,
      validate: {
        validator: (value) => Number.isInteger(value) && value !== 0,
        message: "Ledger quantity must be a non-zero integer",
      },
    },
    stockBefore: { type: Number, required: true, min: 0 },
    stockAfter: { type: Number, required: true, min: 0 },
    // Unit cost in effect for this movement. Inbound rows carry the purchase
    // price; outbound rows carry the moving-average cost so COGS is derivable.
    unitCost: { type: Number, default: 0, min: 0 },
    refType: { type: String, enum: REF_TYPES, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Human-readable pointer (PN000012, DH000345) kept denormalised so the
    // ledger screen never needs a join to render.
    refCode: { type: String, default: "", trim: true, maxlength: 50 },
    reason: { type: String, default: "", trim: true, maxlength: 500 },
    // null means the movement was made by the system (order flow, jobs).
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockLedgerSchema.index({ book: 1, createdAt: -1 });
stockLedgerSchema.index({ type: 1, createdAt: -1 });
stockLedgerSchema.index({ refType: 1, refId: 1 });
stockLedgerSchema.index({ createdAt: -1 });

// The ledger is append-only. Guard the common mutation entry points so a stray
// call cannot silently break reconciliation.
function blockMutation(next) {
  next(new Error("Stock ledger entries are immutable"));
}
stockLedgerSchema.pre("updateOne", blockMutation);
stockLedgerSchema.pre("updateMany", blockMutation);
stockLedgerSchema.pre("findOneAndUpdate", blockMutation);
stockLedgerSchema.pre("deleteOne", blockMutation);
stockLedgerSchema.pre("deleteMany", blockMutation);

const StockLedger = mongoose.model("StockLedger", stockLedgerSchema);
StockLedger.MOVEMENT_TYPES = MOVEMENT_TYPES;
StockLedger.INBOUND_TYPES = INBOUND_TYPES;
module.exports = StockLedger;
