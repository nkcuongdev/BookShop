const mongoose = require("mongoose");

const COUNT_STATUS = ["DRAFT", "COUNTING", "COMPLETED", "CANCELLED"];
const COUNT_SCOPES = ["ALL", "CATEGORY", "CUSTOM"];

const countItemSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    title: { type: String, default: "", trim: true, maxlength: 300 },
    // Book stock frozen at the moment the sheet was generated. This is the
    // *sellable* figure: placing an order decrements it right away, before the
    // goods leave the warehouse.
    systemQty: { type: Number, required: true, min: 0 },
    // Units already committed to orders that have not shipped, so they are
    // still on the shelf and will be counted. Physical stock the counter should
    // expect to see is systemQty + reservedQty.
    reservedQty: { type: Number, default: 0, min: 0 },
    // null until somebody actually counts this line.
    countedQty: { type: Number, default: null, min: 0 },
    difference: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", maxlength: 300 },
  },
  { _id: false }
);

// A stocktake sheet. Completing it forces Book.stock to the counted figure and
// writes a COUNT ledger row for every line that differs.
const stockCountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    status: { type: String, enum: COUNT_STATUS, default: "DRAFT", index: true },
    scope: { type: String, enum: COUNT_SCOPES, default: "ALL" },
    // Category name when scope is CATEGORY; empty otherwise.
    scopeValue: { type: String, default: "", trim: true, maxlength: 100 },
    items: {
      type: [countItemSchema],
      default: [],
      validate: {
        validator: (items) => items.length <= 5000,
        message: "Phiếu kiểm kho tối đa 5000 dòng",
      },
    },
    countedLines: { type: Number, default: 0, min: 0 },
    diffLines: { type: Number, default: 0, min: 0 },
    // Net unit difference across the sheet (can be negative).
    totalDifference: { type: Number, default: 0 },
    // Net value difference at cost (can be negative).
    totalValueDifference: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "", maxlength: 500 },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true, optimisticConcurrency: true }
);

stockCountSchema.index({ status: 1, createdAt: -1 });

stockCountSchema.methods.recalculateTotals = function () {
  let countedLines = 0;
  let diffLines = 0;
  let totalDifference = 0;
  let totalValueDifference = 0;
  for (const item of this.items) {
    if (item.countedQty === null || item.countedQty === undefined) {
      item.difference = 0;
      continue;
    }
    countedLines += 1;
    // The counter reports physical copies, so the variance is measured against
    // what should physically be on the shelf: sellable stock plus the copies
    // held for orders that have not shipped yet.
    item.difference =
      item.countedQty - (item.systemQty + (Number(item.reservedQty) || 0));
    if (item.difference !== 0) {
      diffLines += 1;
      totalDifference += item.difference;
      totalValueDifference += item.difference * (Number(item.unitCost) || 0);
    }
  }
  this.countedLines = countedLines;
  this.diffLines = diffLines;
  this.totalDifference = totalDifference;
  this.totalValueDifference = Math.round(totalValueDifference);
  return this;
};

stockCountSchema.pre("validate", function () {
  this.recalculateTotals();
});

const StockCount = mongoose.model("StockCount", stockCountSchema);
StockCount.COUNT_STATUS = COUNT_STATUS;
StockCount.COUNT_SCOPES = COUNT_SCOPES;
module.exports = StockCount;
