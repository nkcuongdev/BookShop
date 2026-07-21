const mongoose = require("mongoose");

const cartSnapshotSchema = new mongoose.Schema(
  {
    bookId: { type: String, default: "", trim: true, maxlength: 24 },
    title: { type: String, default: "", trim: true, maxlength: 300 },
    author: { type: String, default: "", trim: true, maxlength: 200 },
    imageUrl: { type: String, default: "", maxlength: 2048 },
    price: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const cartItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: Number.isInteger,
    },
    addedAt: { type: Date, default: Date.now },
    snapshot: { type: cartSnapshotSchema, default: () => ({}) },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: {
        validator: (items) => items.length <= 100,
        message: "Cart cannot contain more than 100 products",
      },
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;
