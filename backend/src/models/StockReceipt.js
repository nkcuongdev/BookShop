const mongoose = require("mongoose");

const RECEIPT_STATUS = ["DRAFT", "CONFIRMED", "CANCELLED"];

const receiptItemSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
    },
    // Title snapshot so a cancelled/renamed book still prints correctly.
    title: { type: String, default: "", trim: true, maxlength: 300 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
    unitCost: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", maxlength: 300 },
  },
  { _id: false }
);

// A goods-received note. DRAFT is freely editable and touches no stock;
// CONFIRMED writes the ledger, raises stock and recalculates moving-average
// cost, after which the document is frozen.
const stockReceiptSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    status: { type: String, enum: RECEIPT_STATUS, default: "DRAFT", index: true },
    items: {
      type: [receiptItemSchema],
      default: [],
      validate: {
        validator: (items) => items.length <= 200,
        message: "Phiếu nhập tối đa 200 dòng",
      },
    },
    subtotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    invoiceNumber: { type: String, default: "", trim: true, maxlength: 100 },
    invoiceDate: { type: Date, default: null },
    receivedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "", maxlength: 500 },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true, optimisticConcurrency: true }
);

stockReceiptSchema.index({ status: 1, createdAt: -1 });
stockReceiptSchema.index({ supplier: 1, createdAt: -1 });
stockReceiptSchema.index({ "items.book": 1 });

// Totals are derived, never trusted from the client.
stockReceiptSchema.methods.recalculateTotals = function () {
  let subtotal = 0;
  for (const item of this.items) {
    item.subtotal = Math.round((Number(item.quantity) || 0) * (Number(item.unitCost) || 0));
    subtotal += item.subtotal;
  }
  this.subtotal = subtotal;
  this.totalAmount = Math.max(
    0,
    subtotal - (Number(this.discount) || 0) + (Number(this.shippingFee) || 0)
  );
  return this;
};

stockReceiptSchema.pre("validate", function () {
  this.recalculateTotals();
  if (this.discount > this.subtotal) {
    this.invalidate("discount", "Chiết khấu không được vượt quá tiền hàng");
  }
});

const StockReceipt = mongoose.model("StockReceipt", stockReceiptSchema);
StockReceipt.RECEIPT_STATUS = RECEIPT_STATUS;
module.exports = StockReceipt;
