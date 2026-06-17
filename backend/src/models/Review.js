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

reviewSchema.statics.ensureReviewIndexes = async function () {
  const expectedKey = { book: 1, user: 1 };

  try {
    const indexes = await this.collection.indexes();

    for (const index of indexes) {
      if (index.name === "_id_") continue;
      if (!index.unique) continue;

      const key = index.key || {};
      const isExpected =
        Object.keys(key).length === 2 &&
        key.book === expectedKey.book &&
        key.user === expectedKey.user;
      if (!isExpected) {
        await this.collection.dropIndex(index.name);
        console.log(`Dropped stale review index: ${index.name}`);
      }
    }

    await this.collection.createIndex(expectedKey, {
      unique: true,
      name: "book_1_user_1",
    });
  } catch (error) {
    console.error("Failed to ensure review indexes:", error.message);
  }
};

const Review = mongoose.model("Review", reviewSchema);
module.exports = Review;
