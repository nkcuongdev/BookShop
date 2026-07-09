const mongoose = require("mongoose");
const { safeRegex, parsePositiveInt } = require("../utils/security");
const { isValidIsbn, normalizeIsbn } = require("../utils/bookMetadata");

function normalizeTextSearch(value) {
  return (String(value || "").slice(0, 100).match(/[\p{L}\p{N}]+/gu) || []).join(" ");
}

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
    key: { type: String, required: true, trim: true, maxlength: 100 },
    value: { type: String, default: "", maxlength: 500 },
  },
  { _id: false }
);

const contributorSchema = new mongoose.Schema(
  {
    person: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Author",
      required: true,
    },
    // Snapshot used by order/search/UI reads; renaming an Author does not
    // silently rewrite the bibliographic data of an existing edition.
    name: { type: String, required: true, trim: true, maxlength: 200 },
    role: {
      type: String,
      enum: ["author", "translator", "editor", "illustrator"],
      default: "author",
    },
  },
  { _id: false }
);

const editionSchema = new mongoose.Schema(
  {
    number: { type: Number, default: 1, min: 1, validate: Number.isInteger },
    label: { type: String, default: "", trim: true, maxlength: 100 },
    format: {
      type: String,
      enum: ["paperback", "hardcover", "ebook", "audiobook", "other"],
      default: "paperback",
    },
  },
  { _id: false }
);

const bookSchema = new mongoose.Schema(
  {
    // Core
    title: { type: String, required: true, trim: true, maxlength: 300 },
    author: { type: String, required: true, trim: true, maxlength: 200 },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Author",
      default: null,
      index: true,
    },
    contributors: { type: [contributorSchema], default: [] },
    description: { type: String, default: "", maxlength: 10_000 },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: "", maxlength: 2048 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    // Three-way stock split. `stock` is what a customer can still buy: placing
    // an order decrements it immediately, so it is *not* what sits on the
    // shelf. `reserved` is the copies committed to orders that have not shipped
    // - already out of `stock`, but physically still in the warehouse. The
    // physical figure a stocktake counts is the `onHand` virtual below.
    //
    // Keeping `stock` as the sellable figure means every existing read (cart,
    // checkout, listings, low-stock alerts) keeps its meaning; only inventory
    // work needs the other two.
    stock: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },

    // Publishing
    publisher: { type: String, default: "", trim: true, maxlength: 200 },
    publisherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Publisher",
      default: null,
      index: true,
    },
    publishedDate: { type: Date, default: null },
    isbn: {
      type: String,
      default: "",
      trim: true,
      maxlength: 13,
      set: normalizeIsbn,
      validate: {
        validator: isValidIsbn,
        message: "ISBN must be a valid ISBN-10 or ISBN-13",
      },
    },
    // Canonical uniqueness key. Legacy rows are left unkeyed until they are
    // validated, so deploying the index cannot fail because of dirty historic
    // ISBN values. Every new/edited valid edition receives this key.
    isbnKey: { type: String, default: null, select: false },
    // Non-unique lookup key is also backfilled on legacy rows. It lets writes
    // detect an old formatted ISBN (spaces/hyphens) even when historic
    // duplicates mean those rows cannot safely receive the unique key.
    isbnNormalized: { type: String, default: null, select: false, index: true },
    // All editions of the same work share this id. The first edition points to
    // itself; another edition can submit that id explicitly.
    editionGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      default: null,
      index: true,
    },
    edition: { type: editionSchema, default: () => ({}) },
    pages: { type: Number, default: null, min: 0 },
    language: { type: String, default: "", trim: true, maxlength: 50 },

    // Physical specs (grams / centimeters)
    weight: { type: Number, default: null, min: 0 },
    dimensions: { type: dimensionsSchema, default: () => ({}) },

    // Taxonomy / media
    tags: {
      type: [{ type: String, trim: true, maxlength: 50 }],
      default: [],
      validate: {
        validator: (tags) => tags.length <= 20 && new Set(tags).size === tags.length,
        message: "Book can contain at most 20 unique tags",
      },
    },
    gallery: {
      type: [{ type: String, maxlength: 2048 }],
      default: [],
      validate: {
        validator: (images) => images.length <= 10 && new Set(images).size === images.length,
        message: "Book gallery can contain at most 10 unique images",
      },
    },

    // Custom key-value attributes
    attributes: {
      type: [attributeSchema],
      default: [],
      validate: {
        validator: (attributes) => attributes.length <= 30,
        message: "Book can contain at most 30 attributes",
      },
    },

    // Inventory / costing
    // Moving-average cost, recalculated on every confirmed goods receipt.
    costPrice: { type: Number, default: 0, min: 0 },
    lastPurchasePrice: { type: Number, default: 0, min: 0 },
    // Per-book low-stock threshold. 0 falls back to the system default so
    // existing books keep working without a migration.
    reorderPoint: { type: Number, default: 0, min: 0 },
    reorderQuantity: { type: Number, default: 0, min: 0 },
    defaultSupplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    lastCountedAt: { type: Date, default: null },
    // Throttles the low-stock alert job so admins are not spammed hourly.
    lowStockAlertedAt: { type: Date, default: null },

    // Metrics
    sold: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0, min: 0, select: false },
    ratingAggregateVersion: { type: Number, default: 1, select: false },
  },
  { timestamps: true }
);

// Static: Get best sellers
bookSchema.statics.getBestSellers = function (limit = 8) {
  return this.find({ status: "active" })
    .sort({ sold: -1, _id: 1 })
    .limit(parsePositiveInt(limit, 8, 50))
    .lean();
};

// Static: Get new arrivals
bookSchema.statics.getNewArrivals = function (limit = 8) {
  return this.find({ status: "active" })
    .sort({ createdAt: -1, _id: 1 })
    .limit(parsePositiveInt(limit, 8, 50))
    .lean();
};

// Builds the MongoDB condition shared by findWithFilters and countWithFilters so
// that a listing and its total can never drift apart.
//
// Price bounds are interpreted against the price the customer actually sees
// (after any running promotion), which is why this is async: it needs the
// running promotions to translate that bound back onto the stored price.
async function buildBookFilter(options = {}) {
  const filter = {};

  if (options.category) {
    filter.category = options.category;
  }

  if (options.search) {
    const searchText = normalizeTextSearch(options.search);
    if (searchText) filter.$text = { $search: searchText };
  }

  if (options.tag) {
    filter.tags = String(options.tag).trim();
  }

  if (options.publisher) {
    if (mongoose.isValidObjectId(options.publisher)) {
      filter.publisherId = options.publisher;
    } else {
      const publisherRegex = safeRegex(options.publisher);
      if (publisherRegex) filter.publisher = publisherRegex;
    }
  }

  if (options.author) {
    if (mongoose.isValidObjectId(options.author)) {
      filter.authorId = options.author;
    } else {
      const authorRegex = safeRegex(options.author);
      if (authorRegex) filter.author = authorRegex;
    }
  }

  if (options.language) {
    const languageRegex = safeRegex(options.language);
    if (languageRegex) filter.language = languageRegex;
  }

  if (options.status) {
    filter.status = options.status;
  } else if (!options.includeInactive) {
    filter.status = "active";
  }

  if (options.minRating) {
    filter.rating = { $gte: Number(options.minRating) || 0 };
  }

  if (options.inStock === true || options.inStock === "true" || options.inStock === "1") {
    filter.stock = { $gt: 0 };
  }
  if (options.stockStatus === "out_of_stock") filter.stock = 0;
  if (options.stockStatus === "low_stock") filter.stock = { $gt: 0, $lt: 10 };
  if (options.stockStatus === "in_stock") filter.stock = { $gte: 10 };

  // Admin listings (raw=1) price-filter on the stored price, since that is the
  // number they edit; customer listings filter on the discounted price.
  if (options.includeInactive) {
    const price = {};
    if (options.minPrice !== undefined && options.minPrice !== "") {
      price.$gte = Number(options.minPrice) || 0;
    }
    if (options.maxPrice !== undefined && options.maxPrice !== "") {
      price.$lte = Number(options.maxPrice) || 0;
    }
    if (Object.keys(price).length) filter.price = price;
    return filter;
  }

  // Customer price bounds are applied after all running promotions have been
  // evaluated. Percent and fixed discounts cannot be ranked globally without
  // knowing each book's price, so translating them into a Mongo price range can
  // select a different promotion from the one the customer actually sees.
  return filter;
}

function hasEffectivePriceBounds(options = {}) {
  return (
    (options.minPrice !== undefined && options.minPrice !== "") ||
    (options.maxPrice !== undefined && options.maxPrice !== "")
  );
}

function filterByEffectivePrice(books, options = {}) {
  const hasMin = options.minPrice !== undefined && options.minPrice !== "";
  const hasMax = options.maxPrice !== undefined && options.maxPrice !== "";
  const min = hasMin ? Number(options.minPrice) || 0 : null;
  const max = hasMax ? Number(options.maxPrice) || 0 : null;
  return books.filter((book) => {
    const price = Number(book.price) || 0;
    return (min === null || price >= min) && (max === null || price <= max);
  });
}

// Static: Find with filters
bookSchema.statics.findWithFilters = async function (options = {}) {
  const filter = await buildBookFilter(options);
  const isTextSearch = Boolean(
    filter.$text || (filter.$and || []).some((clause) => clause.$text)
  );

  let query = this.find(filter);
  let effectivePriceDirection = null;

  // Sorting
  if (options.sortBy === "relevance" && isTextSearch) {
    query = query
      .select({ searchScore: { $meta: "textScore" } })
      .sort({ searchScore: { $meta: "textScore" }, _id: 1 });
  } else if (options.sortBy) {
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
    const field = fieldMap[options.sortBy] || "createdAt";
    const direction =
      options.sortBy === "price-asc" || options.sortBy === "name"
        ? 1
        : options.sortBy === "price-desc"
          ? -1
          : sortOrder;

    // Sorting by price has to follow the discounted price the customer sees.
    // That value is computed at read time, so it cannot be sorted in MongoDB;
    // the sort is finished in memory below, after decoration.
    if (field === "price" && !options.includeInactive) {
      effectivePriceDirection = direction;
    } else {
      query = query.sort({ [field]: direction, _id: direction });
    }
  } else if (isTextSearch) {
    query = query
      .select({ searchScore: { $meta: "textScore" } })
      .sort({ searchScore: { $meta: "textScore" }, _id: 1 });
  } else {
    query = query.sort({ createdAt: -1, _id: 1 });
  }

  const needsEffectivePricePass =
    !options.includeInactive &&
    (effectivePriceDirection !== null || hasEffectivePriceBounds(options));
  if (needsEffectivePricePass) {
    const Promotion = mongoose.model("Promotion");
    let decorated = await Promotion.decorateBooks(await query.lean().exec(), {
      promotions: options.promotions,
    });
    if (hasEffectivePriceBounds(options)) {
      decorated = filterByEffectivePrice(decorated, options);
    }
    if (effectivePriceDirection !== null) {
      decorated.sort((a, b) => {
        const diff = (a.price - b.price) * effectivePriceDirection;
        return diff || String(a._id).localeCompare(String(b._id));
      });
    }
    if (options.limit) {
      const limit = parsePositiveInt(options.limit, 20, 100);
      const page = parsePositiveInt(options.page, 1, 10_000);
      decorated = decorated.slice((page - 1) * limit, page * limit);
    }
    decorated.forEach((book) => {
      book.__decorated = true;
    });
    return decorated;
  }

  // Pagination
  if (options.limit) {
    const limit = parsePositiveInt(options.limit, 20, 100);
    const page = parsePositiveInt(options.page, 1, 10_000);
    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit);
  }

  return query.lean().exec();
};

bookSchema.statics.countWithFilters = async function (options = {}) {
  const filter = await buildBookFilter(options);
  if (!options.includeInactive && hasEffectivePriceBounds(options)) {
    const Promotion = mongoose.model("Promotion");
    const decorated = await Promotion.decorateBooks(await this.find(filter).lean(), {
      promotions: options.promotions,
    });
    return filterByEffectivePrice(decorated, options).length;
  }
  return this.countDocuments(filter);
};

bookSchema.index(
  { title: "text", author: "text", publisher: "text", isbn: "text", tags: "text" },
  {
    name: "book_search",
    default_language: "none",
    language_override: "searchLanguage",
    weights: { title: 10, author: 7, isbn: 7, publisher: 3, tags: 2 },
  }
);
/**
 * Copies physically in the warehouse: what a stocktake should find on the
 * shelf. Derived rather than stored, so it can never drift from the two fields
 * it is built from.
 */
bookSchema.virtual("onHand").get(function () {
  return (Number(this.stock) || 0) + (Number(this.reserved) || 0);
});

bookSchema.set("toJSON", { virtuals: true });
bookSchema.set("toObject", { virtuals: true });

bookSchema.index({ status: 1, createdAt: -1 });
bookSchema.index({ status: 1, stock: 1 });
bookSchema.index({ defaultSupplier: 1 });
bookSchema.index({ status: 1, sold: -1 });
bookSchema.index({ status: 1, category: 1, sold: -1 });
bookSchema.index(
  { isbnKey: 1 },
  {
    unique: true,
    partialFilterExpression: { isbnKey: { $type: "string" } },
  }
);
bookSchema.index({ "contributors.person": 1, "contributors.role": 1 });
bookSchema.index(
  { editionGroup: 1, "edition.number": 1, "edition.format": 1 },
  { unique: true, partialFilterExpression: { editionGroup: { $type: "objectId" } } }
);

bookSchema.pre("validate", function () {
  if (!this.editionGroup) this.editionGroup = this._id;
  this.isbnKey = this.isbn ? normalizeIsbn(this.isbn) : null;
  this.isbnNormalized = this.isbnKey;
});

// Update sold count (stock đã được trừ lúc đặt đơn, ở đây chỉ tăng sold)
bookSchema.statics.updateSold = async function (id, quantity) {
  return this.findByIdAndUpdate(
    id,
    { $inc: { sold: quantity } },
    { returnDocument: "after" }
  );
};

// Atomic O(1) update for the normal append-only review path.
bookSchema.statics.addRating = function (bookId, rating, options = {}) {
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new Error("Invalid rating");
  }
  return this.findOneAndUpdate(
    { _id: bookId },
    [
      {
        $set: {
          ratingSum: { $add: [{ $ifNull: ["$ratingSum", 0] }, numericRating] },
          reviewCount: { $add: [{ $ifNull: ["$reviewCount", 0] }, 1] },
          ratingAggregateVersion: 1,
        },
      },
      {
        $set: {
          rating: {
            $divide: [
              {
                $floor: {
                  $add: [
                    {
                      $multiply: [
                        { $divide: ["$ratingSum", "$reviewCount"] },
                        10,
                      ],
                    },
                    0.5,
                  ],
                },
              },
              10,
            ],
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true, ...options }
  );
};

// Atomic aggregate adjustment used by review edits, removals and moderation.
bookSchema.statics.adjustRating = function (
  bookId,
  ratingDelta,
  countDelta = 0,
  options = {}
) {
  const numericRatingDelta = Number(ratingDelta);
  const numericCountDelta = Number(countDelta);
  if (!Number.isFinite(numericRatingDelta) || !Number.isInteger(numericCountDelta)) {
    throw new Error("Invalid rating adjustment");
  }

  return this.findOneAndUpdate(
    { _id: bookId },
    [
      {
        $set: {
          ratingSum: {
            $max: [0, { $add: [{ $ifNull: ["$ratingSum", 0] }, numericRatingDelta] }],
          },
          reviewCount: {
            $max: [0, { $add: [{ $ifNull: ["$reviewCount", 0] }, numericCountDelta] }],
          },
          ratingAggregateVersion: 1,
        },
      },
      {
        $set: {
          rating: {
            $cond: [
              { $gt: ["$reviewCount", 0] },
              {
                $divide: [
                  {
                    $floor: {
                      $add: [
                        { $multiply: [{ $divide: ["$ratingSum", "$reviewCount"] }, 10] },
                        0.5,
                      ],
                    },
                  },
                  10,
                ],
              },
              0,
            ],
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true, ...options }
  );
};

// Rebuild helper for imports, repairs and legacy data. This performs the work
// inside MongoDB rather than loading every review into the Node.js process.
bookSchema.statics.updateRating = async function (bookId) {
  const Review = require("./Review");
  const [stats] = await Review.aggregate([
    {
      $match: {
        book: new mongoose.Types.ObjectId(String(bookId)),
        status: { $ne: "hidden" },
      },
    },
    {
      $group: {
        _id: "$book",
        ratingSum: { $sum: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);
  const ratingSum = Number(stats?.ratingSum) || 0;
  const reviewCount = Number(stats?.reviewCount) || 0;
  const rating = reviewCount
    ? Math.round((ratingSum / reviewCount) * 10) / 10
    : 0;

  return this.findByIdAndUpdate(
    bookId,
    { rating, ratingSum, reviewCount, ratingAggregateVersion: 1 },
    { returnDocument: "after" }
  );
};

bookSchema.statics.migrateRatingAggregates = async function () {
  const Review = require("./Review");
  const legacyBooks = await this.find({ ratingAggregateVersion: { $ne: 1 } })
    .select("_id")
    .lean();
  if (!legacyBooks.length) return 0;

  const ids = legacyBooks.map((book) => book._id);
  const rows = await Review.aggregate([
    { $match: { book: { $in: ids }, status: { $ne: "hidden" } } },
    {
      $group: {
        _id: "$book",
        ratingSum: { $sum: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);
  const byBook = new Map(rows.map((row) => [String(row._id), row]));
  const operations = legacyBooks.map((book) => {
    const row = byBook.get(String(book._id));
    const ratingSum = Number(row?.ratingSum) || 0;
    const reviewCount = Number(row?.reviewCount) || 0;
    return {
      updateOne: {
        filter: { _id: book._id, ratingAggregateVersion: { $ne: 1 } },
        update: {
          $set: {
            ratingSum,
            reviewCount,
            rating: reviewCount
              ? Math.round((ratingSum / reviewCount) * 10) / 10
              : 0,
            ratingAggregateVersion: 1,
          },
        },
      },
    };
  });
  const result = await this.bulkWrite(operations, { ordered: false });
  return result.modifiedCount || 0;
};

bookSchema.statics.reconcileRatingAggregates = async function () {
  const Review = require("./Review");
  const rows = await Review.aggregate([
    { $match: { status: { $ne: "hidden" } } },
    {
      $group: {
        _id: "$book",
        ratingSum: { $sum: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);
  const byBook = new Map(rows.map((row) => [String(row._id), row]));
  const books = await this.find({}).select("_id").lean();
  if (!books.length) return 0;

  const operations = books.map((book) => {
    const row = byBook.get(String(book._id));
    const ratingSum = Number(row?.ratingSum) || 0;
    const reviewCount = Number(row?.reviewCount) || 0;
    return {
      updateOne: {
        filter: { _id: book._id },
        update: {
          $set: {
            ratingSum,
            reviewCount,
            rating: reviewCount
              ? Math.round((ratingSum / reviewCount) * 10) / 10
              : 0,
            ratingAggregateVersion: 1,
          },
        },
      },
    };
  });

  const result = await this.bulkWrite(operations, { ordered: false });
  return result.modifiedCount || 0;
};

const Book = mongoose.model("Book", bookSchema);
module.exports = Book;
