const mongoose = require("mongoose");

const dimensionsSchema = new mongoose.Schema(
  {
    length: { type: Number, min: 0, default: null },
    width: { type: Number, min: 0, default: null },
    height: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const attributeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const bookSchema = new mongoose.Schema(
  {
    // Core
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: "" },
    category: { type: String, required: true },
    stock: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },

    // Publishing
    publisher: { type: String, default: "", trim: true },
    publishedDate: { type: Date, default: null },
    isbn: { type: String, default: "", trim: true, index: true },
    pages: { type: Number, default: null, min: 0 },
    language: { type: String, default: "", trim: true },

    // Physical specs (grams / centimeters)
    weight: { type: Number, default: null, min: 0 },
    dimensions: { type: dimensionsSchema, default: () => ({}) },

    // Taxonomy / media
    tags: { type: [String], default: [] },
    gallery: { type: [String], default: [] },

    // Custom key-value attributes
    attributes: { type: [attributeSchema], default: [] },

    // Metrics
    sold: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Static: Get best sellers
bookSchema.statics.getBestSellers = function (limit = 8) {
  return this.find().sort({ sold: -1 }).limit(limit);
};

// Static: Get new arrivals
bookSchema.statics.getNewArrivals = function (limit = 8) {
  return this.find().sort({ createdAt: -1 }).limit(limit);
};

// Static: Find with filters
bookSchema.statics.findWithFilters = async function (options = {}) {
  let query = this.find();

  if (options.category) {
    query = query.where("category").equals(options.category);
  }

  if (options.search) {
    const searchRegex = new RegExp(options.search, "i");
    query = query.or([{ title: searchRegex }, { author: searchRegex }]);
  }

  // Sorting
  if (options.sortBy) {
    const sortOrder = options.order === "asc" ? 1 : -1;
    query = query.sort({ [options.sortBy]: sortOrder });
  } else {
    query = query.sort({ createdAt: -1 });
  }

  // Pagination
  if (options.limit) {
    const limit = parseInt(options.limit);
    const page = parseInt(options.page) || 1;
    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit);
  }

  return query.exec();
};

// Update sold count (stock đã được trừ lúc đặt đơn, ở đây chỉ tăng sold)
bookSchema.statics.updateSold = async function (id, quantity) {
  return this.findByIdAndUpdate(
    id,
    { $inc: { sold: quantity } },
    { new: true }
  );
};

// Update rating from reviews
bookSchema.statics.updateRating = async function (bookId) {
  const Review = require("./Review");
  const reviews = await Review.find({ book: bookId });

  if (reviews.length === 0) return;

  const avgRating =
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return this.findByIdAndUpdate(
    bookId,
    { rating: Math.round(avgRating * 10) / 10, reviewCount: reviews.length },
    { new: true }
  );
};

const Book = mongoose.model("Book", bookSchema);
module.exports = Book;
