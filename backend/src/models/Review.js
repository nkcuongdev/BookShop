const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, default: "", trim: true, maxlength: 100 },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be an integer",
      },
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 500,
    },
    images: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 2048,
        },
      ],
      default: [],
      validate: {
        validator: (images) => images.length <= 3 && new Set(images).size === images.length,
        message: "A review can contain at most 3 unique images",
      },
    },
    status: {
      type: String,
      enum: ["visible", "hidden"],
      default: "visible",
      index: true,
    },
    reportCount: { type: Number, default: 0, min: 0 },
    moderation: {
      hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      hiddenAt: { type: Date, default: null },
      reason: { type: String, default: "", trim: true, maxlength: 300 },
    },
  },
  { timestamps: true }
);

// Ensure one review per user per book
reviewSchema.index({ book: 1, user: 1 }, { unique: true });

// Static: Get reviews by book
reviewSchema.statics.getByBook = function (bookId, options = {}) {
  const page = Math.max(Number.parseInt(options.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(options.limit, 10) || 10, 1), 50);
  const filter = { book: bookId, status: { $ne: "hidden" } };
  if (options.rating) filter.rating = Number(options.rating);
  return this.find(filter)
    .populate("user", "name")
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static: Count visible reviews per star for a book.
//
// Computed over every visible review, not just the page currently loaded, so
// the rating histogram stays stable while the reader pages through reviews.
// Always returns all five buckets, including the ones with no reviews.
reviewSchema.statics.getRatingBreakdown = async function (bookId) {
  const rows = await this.aggregate([
    { $match: { book: new mongoose.Types.ObjectId(String(bookId)), status: { $ne: "hidden" } } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]);

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  for (const row of rows) {
    const star = Math.floor(Number(row._id));
    if (star >= 1 && star <= 5) {
      breakdown[star] = row.count;
      total += row.count;
    }
  }
  return { breakdown, total };
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

  const indexes = await this.collection.indexes();

  for (const index of indexes) {
    if (index.name === "_id_") continue;
    if (!index.unique) continue;

    const key = index.key || {};
    const isExpected =
      Object.keys(key).length === 2 &&
      key.book === expectedKey.book &&
      key.user === expectedKey.user;
    const isKnownLegacyIndex =
      Object.keys(key).length === 1 && (key.book === 1 || key.user === 1);
    if (!isExpected && isKnownLegacyIndex) {
      await this.collection.dropIndex(index.name);
      console.log(`Dropped stale review index: ${index.name}`);
    }
  }

  await this.collection.createIndex(expectedKey, {
    unique: true,
    name: "book_1_user_1",
  });
};

const Review = mongoose.model("Review", reviewSchema);
module.exports = Review;
