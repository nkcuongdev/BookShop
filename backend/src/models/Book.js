const mongoose = require("mongoose");
const { safeRegex, parsePositiveInt } = require("../utils/security");

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
  return this.find({ status: "active" }).sort({ sold: -1 }).limit(parsePositiveInt(limit, 8, 50));
};

// Static: Get new arrivals
bookSchema.statics.getNewArrivals = function (limit = 8) {
  return this.find({ status: "active" }).sort({ createdAt: -1 }).limit(parsePositiveInt(limit, 8, 50));
};

// Static: Find with filters
bookSchema.statics.findWithFilters = async function (options = {}) {
  const filter = {};

  if (options.category) {
    filter.category = options.category;
  }

  if (options.search) {
    const searchRegex = safeRegex(options.search);
    if (searchRegex) {
    filter.$or = [
      { title: searchRegex },
      { author: searchRegex },
      { isbn: searchRegex },
      { publisher: searchRegex },
      { tags: searchRegex },
    ];
    }
  }

  if (options.tag) {
    filter.tags = String(options.tag).trim();
  }

  if (options.publisher) {
    const publisherRegex = safeRegex(options.publisher);
    if (publisherRegex) filter.publisher = publisherRegex;
  }

  if (options.status) {
    filter.status = options.status;
  } else if (!options.includeInactive) {
    filter.status = "active";
  }

  const price = {};
  if (options.minPrice !== undefined && options.minPrice !== "") {
    price.$gte = Number(options.minPrice) || 0;
  }
  if (options.maxPrice !== undefined && options.maxPrice !== "") {
    price.$lte = Number(options.maxPrice) || 0;
  }
  if (Object.keys(price).length) filter.price = price;

  if (options.minRating) {
    filter.rating = { $gte: Number(options.minRating) || 0 };
  }

  if (options.inStock === true || options.inStock === "true" || options.inStock === "1") {
    filter.stock = { $gt: 0 };
  }

  let query = this.find(filter);

  // Sorting
  if (options.sortBy) {
    const sortOrder = options.order === "asc" ? 1 : -1;
    const fieldMap = {
      bestseller: "sold",
      newest: "createdAt",
      rating: "rating",
      name: "title",
      price: "price",
      "price-asc": "price",
      "price-desc": "price",
    };
    const field = fieldMap[options.sortBy] || options.sortBy;
    const direction =
      options.sortBy === "price-asc" || options.sortBy === "name"
        ? 1
        : options.sortBy === "price-desc"
          ? -1
          : sortOrder;
    query = query.sort({ [field]: direction });
  } else {
    query = query.sort({ createdAt: -1 });
  }

  // Pagination
  if (options.limit) {
    const limit = parsePositiveInt(options.limit, 20, 100);
    const page = parsePositiveInt(options.page, 1, 10_000);
    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit);
  }

  return query.exec();
};

bookSchema.statics.countWithFilters = function (options = {}) {
  const filter = {};
  if (options.category) filter.category = options.category;
  if (options.search) {
    const searchRegex = safeRegex(options.search);
    if (searchRegex) {
    filter.$or = [
      { title: searchRegex },
      { author: searchRegex },
      { isbn: searchRegex },
      { publisher: searchRegex },
      { tags: searchRegex },
    ];
    }
  }
  if (options.tag) filter.tags = String(options.tag).trim();
  if (options.publisher) {
    const publisherRegex = safeRegex(options.publisher);
    if (publisherRegex) filter.publisher = publisherRegex;
  }
  if (options.status) filter.status = options.status;
  else if (!options.includeInactive) filter.status = "active";
  const price = {};
  if (options.minPrice !== undefined && options.minPrice !== "") price.$gte = Number(options.minPrice) || 0;
  if (options.maxPrice !== undefined && options.maxPrice !== "") price.$lte = Number(options.maxPrice) || 0;
  if (Object.keys(price).length) filter.price = price;
  if (options.minRating) filter.rating = { $gte: Number(options.minRating) || 0 };
  if (options.inStock === true || options.inStock === "true" || options.inStock === "1") {
    filter.stock = { $gt: 0 };
  }
  return this.countDocuments(filter);
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

  if (reviews.length === 0) {
    return this.findByIdAndUpdate(
      bookId,
      { rating: 0, reviewCount: 0 },
      { new: true }
    );
  }

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
