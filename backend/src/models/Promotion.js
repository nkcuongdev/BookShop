const mongoose = require("mongoose");

const RUNNING_CACHE_TTL_MS = 30_000;
let runningCache = { expiresAt: 0, value: null, pending: null };

function clearRunningCache() {
  runningCache = { expiresAt: 0, value: null, pending: null };
}

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
    wishlistAlertProcessedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

promotionSchema.index({ active: 1, startDate: 1, endDate: 1 });
promotionSchema.index({
  active: 1,
  wishlistAlertProcessedAt: 1,
  startDate: 1,
  endDate: 1,
});
promotionSchema.index({ scope: 1, category: 1 });
promotionSchema.index({ books: 1 });

promotionSchema.post("save", clearRunningCache);
promotionSchema.post("findOneAndUpdate", clearRunningCache);
promotionSchema.post("findOneAndDelete", clearRunningCache);
promotionSchema.post("deleteOne", clearRunningCache);
promotionSchema.post("deleteMany", clearRunningCache);
promotionSchema.post("updateMany", clearRunningCache);

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
promotionSchema.statics.decorateBooks = async function (books, options = {}) {
  if (!books || books.length === 0) return books;

  // Normalize to plain objects while preserving any existing enrichments
  const plain = books.map((b) =>
    typeof b.toObject === "function" ? { ...b.toObject(), id: b._id } : b
  );

  const promos = options.promotions || (await this.getRunningPromotions(options));

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

/**
 * Invert computePrice: given a discounted-price bound, return the stored
 * Book.price bound that maps onto it under this promotion.
 *
 * computePrice is monotonically non-decreasing in the original price, so a
 * range on the discounted price maps back to a range on the stored price.
 * `direction` is "min" for a lower bound and "max" for an upper bound; the
 * rounding is widened on each side so books sitting exactly on the boundary are
 * never dropped by an off-by-one from Math.round.
 */
promotionSchema.methods.invertPrice = function (targetPrice, direction) {
  if (!Number.isFinite(targetPrice)) return null;
  if (this.type === "percent") {
    const factor = 1 - Math.min(this.value, 100) / 100;
    // A 100% discount makes every price collapse to 0, so no stored price can
    // be excluded by an upper bound and none can satisfy a positive lower one.
    if (factor <= 0) return direction === "min" ? Infinity : null;
    const raw = targetPrice / factor;
    return direction === "min" ? Math.floor(raw) : Math.ceil(raw);
  }
  return targetPrice + this.value;
};

/**
 * Translate a filter on the *discounted* price into an equivalent MongoDB
 * condition on the stored Book.price, so filtering, counting and pagination all
 * agree with the price the customer actually sees.
 *
 * Books are partitioned by which running promotion wins for them. Each
 * partition gets its own inverted price window, and the windows are OR-ed
 * together. Books matched by no promotion keep the plain stored-price window.
 *
 * Returns null when no price bound was requested.
 */
promotionSchema.statics.buildEffectivePriceFilter = async function (
  { minPrice, maxPrice } = {},
  options = {}
) {
  const hasMin = minPrice !== undefined && minPrice !== "" && minPrice !== null;
  const hasMax = maxPrice !== undefined && maxPrice !== "" && maxPrice !== null;
  if (!hasMin && !hasMax) return null;

  const min = hasMin ? Number(minPrice) || 0 : null;
  const max = hasMax ? Number(maxPrice) || 0 : null;

  const buildRange = (lo, hi) => {
    const range = {};
    if (lo !== null && lo !== undefined && Number.isFinite(lo)) range.$gte = lo;
    if (hi !== null && hi !== undefined && Number.isFinite(hi)) range.$lte = hi;
    return range;
  };

  const promos = options.promotions || (await this.getRunningPromotions(options));
  const undiscounted = buildRange(min, max);

  if (!promos.length) {
    return Object.keys(undiscounted).length ? { price: undiscounted } : null;
  }

  // Deepest discount first: the first promotion that applies to a book is the
  // one decorateBooks would pick, so a book belongs to that branch only if no
  // earlier (deeper) promotion also claims it.
  const ranked = [...promos].sort((a, b) => {
    const score = (p) => (p.type === "percent" ? Math.min(p.value, 100) : p.value);
    if (a.type === b.type) return score(b) - score(a);
    // Percent and fixed discounts are not directly comparable without a price,
    // so keep a stable order and rely on the per-branch exclusions below.
    return a.type === "percent" ? -1 : 1;
  });

  const scopeOf = (promotion) => {
    if (promotion.scope === "category") {
      return promotion.category ? { category: promotion.category } : null;
    }
    const ids = (promotion.books || []).filter(Boolean);
    return ids.length ? { _id: { $in: ids } } : null;
  };

  const branches = [];
  const claimed = [];

  for (const promotion of ranked) {
    const scope = scopeOf(promotion);
    if (!scope) continue;

    const lo = min === null ? null : promotion.invertPrice(min, "min");
    const hi = max === null ? null : promotion.invertPrice(max, "max");
    // invertPrice returns Infinity when a 100% discount makes a positive lower
    // bound unsatisfiable for every book in this branch.
    if (lo !== Infinity) {
      const range = buildRange(lo, hi);
      const branch = Object.keys(range).length ? { ...scope, price: range } : { ...scope };
      if (claimed.length) branch.$nor = [...claimed];
      branches.push(branch);
    }
    claimed.push(scope);
  }

  // Books no running promotion touches are compared on their stored price.
  const plain = Object.keys(undiscounted).length ? { price: undiscounted } : {};
  branches.push(claimed.length ? { ...plain, $nor: [...claimed] } : plain);

  if (!branches.length) return null;
  return branches.length === 1 ? branches[0] : { $or: branches };
};

promotionSchema.statics.getRunningPromotions = async function (options = {}) {
  const now = new Date();
  if (options.session) {
    return this.find({
      active: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .select("name type value scope books category endDate createdAt")
      .sort({ createdAt: -1 })
      .session(options.session);
  }

  if (runningCache.value && runningCache.expiresAt > Date.now()) {
    return runningCache.value;
  }
  if (runningCache.pending) return runningCache.pending;

  runningCache.pending = this.find({
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .select("name type value scope books category endDate createdAt")
    .sort({ createdAt: -1 })
    .then((promotions) => {
      runningCache = {
        value: promotions,
        expiresAt: Date.now() + RUNNING_CACHE_TTL_MS,
        pending: null,
      };
      return promotions;
    })
    .catch((error) => {
      clearRunningCache();
      throw error;
    });

  return runningCache.pending;
};

const Promotion = mongoose.model("Promotion", promotionSchema);
module.exports = Promotion;
