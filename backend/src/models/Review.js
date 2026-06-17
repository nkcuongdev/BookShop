const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

// Ensure one review per user per book
reviewSchema.index({ book: 1, user: 1 }, { unique: true });

// Static: Get reviews by book
reviewSchema.statics.getByBook = function (bookId) {
  return this.find({ book: bookId })
    .populate("user", "name email")
    .sort({ createdAt: -1 });
};

// Static: Check if user can review
reviewSchema.statics.canUserReview = async function (userId, bookId) {
  const Order = require("./Order");

  // Check if already reviewed
  const existingReview = await this.findOne({ user: userId, book: bookId });
  if (existingReview) return false;

  // Check if user purchased the book
  const hasPurchased = await Order.hasUserPurchasedBook(userId, bookId);
  return hasPurchased;
};

const Review = mongoose.model("Review", reviewSchema);
module.exports = Review;
