const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: ["percent", "fixed"],
      required: true,
    },
    value: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    scope: {
      type: String,
      enum: ["products", "category"],
      required: true,
    },
    books: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }],
    category: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

promotionSchema.index({ active: 1, startDate: 1, endDate: 1 });
promotionSchema.index({ scope: 1, category: 1 });
promotionSchema.index({ books: 1 });

// Status derivation (not stored)
promotionSchema.methods.getStatus = function () {
  const now = new Date();
  if (!this.active) return "inactive";
  if (this.startDate > now) return "upcoming";
  if (this.endDate < now) return "expired";
  return "active";
};

// Is this promotion currently valid (active + in time window)?
promotionSchema.methods.isRunning = function () {
  const now = new Date();
  return this.active && this.startDate <= now && this.endDate >= now;
};

// Compute discounted price given original price
promotionSchema.methods.computePrice = function (originalPrice) {
  if (!originalPrice || originalPrice <= 0) return originalPrice;
  let price;
  if (this.type === "percent") {
    price = Math.round(originalPrice * (1 - Math.min(this.value, 100) / 100));
  } else {
    price = originalPrice - this.value;
  }
  return Math.max(0, price);
};

// Does this promotion apply to a given book?
promotionSchema.methods.appliesTo = function (book) {
  if (!book) return false;
  if (this.scope === "category") {
    return !!this.category && book.category === this.category;
  }
  if (this.scope === "products") {
    const bookId = String(book._id || book.id);
    return (this.books || []).some((b) => String(b) === bookId);
  }
  return false;
};

/**
 * Load all currently-running promotions, then decorate a list of books
 * (plain objects or mongoose docs) with:
 *  - originalPrice: the stored Book.price
 *  - price: discounted price (if a matching promotion exists)
 *  - discountPercent: rounded %
 *  - activePromotion: { id, name, type, value, endDate }
 * Books without a matching promotion are returned unchanged.
 *
 * NOTE: salePrice is NEVER stored on Book. These fields are computed at read time.
 */
promotionSchema.statics.decorateBooks = async function (books) {
  if (!books || books.length === 0) return books;

  // Normalize to plain objects while preserving any existing enrichments
  const plain = books.map((b) =>
    typeof b.toObject === "function" ? { ...b.toObject(), id: b._id } : b
  );

  const now = new Date();
  const promos = await this.find({
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ createdAt: -1 });

  if (promos.length === 0) return plain;

  return plain.map((book) => {
    // Find best (deepest discount) promotion for this book
    let best = null;
    let bestPrice = book.price;

    for (const p of promos) {
      if (!p.appliesTo(book)) continue;
      const candidate = p.computePrice(book.price);
      if (candidate < bestPrice) {
        bestPrice = candidate;
        best = p;
      }
    }

    if (!best) return book;

    const originalPrice = book.price;
    const discountPercent =
      originalPrice > 0
        ? Math.round(((originalPrice - bestPrice) / originalPrice) * 100)
        : 0;

    return {
      ...book,
      price: bestPrice,
      originalPrice,
      discountPercent,
      activePromotion: {
        id: best._id,
        name: best.name,
        type: best.type,
        value: best.value,
        endDate: best.endDate,
      },
    };
  });
};

const Promotion = mongoose.model("Promotion", promotionSchema);
module.exports = Promotion;
