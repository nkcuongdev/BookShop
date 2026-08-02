const mongoose = require("mongoose");

const ISSUE_STATUS = ["DRAFT", "CONFIRMED", "CANCELLED"];
// Why stock left the warehouse for a reason other than a customer order.
const ISSUE_TYPES = [
  "DAMAGED",
  "LOST",
  "GIFT",
  "SAMPLE",
  "RETURN_SUPPLIER",
  "OTHER",
];

// Issue types that represent a write-off rather than a deliberate transfer.
const DAMAGE_TYPES = new Set(["DAMAGED", "LOST"]);

const issueItemSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    title: { type: String, default: "", trim: true, maxlength: 300 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
    // Snapshot of the moving-average cost, filled in at confirmation so the
    // loss is valued at what the goods actually cost.
    unitCost: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", maxlength: 300 },
  },
  { _id: false }
);

const stockIssueSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ISSUE_TYPES, required: true, index: true },
    status: { type: String, enum: ISSUE_STATUS, default: "DRAFT", index: true },
    items: {
      type: [issueItemSchema],
      default: [],
      validate: {
        validator: (items) => items.length <= 200,
        message: "Phiếu xuất tối đa 200 dòng",
      },
    },
    // Total value of the goods leaving, at cost.
    totalCost: { type: Number, default: 0, min: 0 },
    // Only meaningful for RETURN_SUPPLIER.
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    issuedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "", maxlength: 500 },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true, optimisticConcurrency: true }
);

stockIssueSchema.index({ status: 1, createdAt: -1 });
stockIssueSchema.index({ type: 1, createdAt: -1 });
stockIssueSchema.index({ "items.book": 1 });

stockIssueSchema.methods.recalculateTotals = function () {
  let totalCost = 0;
  for (const item of this.items) {
    item.subtotal = Math.round((Number(item.quantity) || 0) * (Number(item.unitCost) || 0));
    totalCost += item.subtotal;
  }
  this.totalCost = totalCost;
  return this;
};

stockIssueSchema.pre("validate", function () {
  this.recalculateTotals();
  if (this.type !== "RETURN_SUPPLIER") {
    this.supplier = null;
  }
});

const StockIssue = mongoose.model("StockIssue", stockIssueSchema);
StockIssue.ISSUE_STATUS = ISSUE_STATUS;
StockIssue.ISSUE_TYPES = ISSUE_TYPES;
StockIssue.DAMAGE_TYPES = DAMAGE_TYPES;
module.exports = StockIssue;
