const mongoose = require("mongoose");

// Programme-wide settings for the loyalty scheme, held as a single document.
//
// This is configuration, not sample data: admins tune the earn rate and the
// tier ladder at runtime, so it cannot live in a config file, and seeding must
// never wipe it (same reasoning as the Role collection).
const DEFAULT_TIERS = Object.freeze([
  {
    key: "silver",
    label: "Bạc",
    threshold: 0,
    multiplier: 1,
    color: "#94a3b8",
    benefits: ["Tích 1 điểm cho mỗi 10.000đ chi tiêu"],
  },
  {
    key: "gold",
    label: "Vàng",
    threshold: 5_000_000,
    multiplier: 1.2,
    color: "#f59e0b",
    benefits: ["Tích điểm nhân 1.2", "Ưu tiên hỗ trợ khách hàng"],
  },
  {
    key: "diamond",
    label: "Kim cương",
    threshold: 20_000_000,
    multiplier: 1.5,
    color: "#38bdf8",
    benefits: [
      "Tích điểm nhân 1.5",
      "Ưu tiên hỗ trợ khách hàng",
      "Quà tặng sinh nhật",
    ],
  },
]);

const tierSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 30,
      match: /^[a-z0-9_-]+$/,
    },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    // Spend inside the rolling window required to reach this tier, in whole VND.
    threshold: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    multiplier: { type: Number, required: true, min: 0, max: 10 },
    color: { type: String, default: "", trim: true, maxlength: 20 },
    benefits: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.length <= 20,
        message: "A tier cannot list more than 20 benefits",
      },
    },
  },
  { _id: false }
);

const loyaltyProgramSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, immutable: true },
    enabled: { type: Boolean, default: true },

    // Earning: how many VND buy one point, before the tier multiplier.
    earnRate: {
      type: Number,
      default: 10_000,
      min: 1_000,
      max: 10_000_000,
      validate: Number.isInteger,
    },
    // Days to wait after delivery before points land. 0 credits immediately,
    // which is the current policy: the small leakage from a customer spending
    // points then returning goods is cheaper than making everyone wait.
    earnHoldDays: {
      type: Number,
      default: 0,
      min: 0,
      max: 60,
      validate: Number.isInteger,
    },

    // Spending at checkout.
    redeemEnabled: { type: Boolean, default: true },
    // VND knocked off the bill per point spent.
    redeemRate: {
      type: Number,
      default: 1_000,
      min: 100,
      max: 1_000_000,
      validate: Number.isInteger,
    },
    redeemMinPoints: {
      type: Number,
      default: 10,
      min: 1,
      validate: Number.isInteger,
    },
    // Ceiling on how much of the goods total (net of order vouchers, excluding
    // shipping) may be paid with points.
    redeemMaxPercent: { type: Number, default: 30, min: 1, max: 100 },
    // Points must be spent in multiples of this, so totals stay legible.
    redeemStep: {
      type: Number,
      default: 10,
      min: 1,
      validate: Number.isInteger,
    },

    tiers: {
      type: [tierSchema],
      default: () => DEFAULT_TIERS.map((tier) => ({ ...tier })),
      validate: {
        validator: (tiers) =>
          tiers.length >= 1 &&
          tiers.length <= 10 &&
          new Set(tiers.map((tier) => tier.key)).size === tiers.length,
        message: "Tiers must be 1-10 entries with unique keys",
      },
    },
    // Rolling window used to judge a customer's tier.
    tierWindowDays: {
      type: Number,
      default: 365,
      min: 30,
      max: 1095,
      validate: Number.isInteger,
    },
    // Grace granted after a customer drops below their tier's threshold, so a
    // quiet month does not bounce them up and down.
    tierGraceDays: {
      type: Number,
      default: 30,
      min: 0,
      max: 180,
      validate: Number.isInteger,
    },

    // Expiry is designed for but switched off. See the plan: per-batch FIFO
    // would break the append-only ledger, and inactivity-based expiry is the
    // simpler answer if this is ever needed.
    expiryEnabled: { type: Boolean, default: false },
    expiryDays: {
      type: Number,
      default: 730,
      min: 30,
      max: 3650,
      validate: Number.isInteger,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

loyaltyProgramSchema.pre("validate", function () {
  if (!Array.isArray(this.tiers) || this.tiers.length === 0) return;

  // Sort here rather than trusting the caller: resolveTier walks the ladder in
  // order, and every consumer reads it back assuming ascending thresholds.
  this.tiers.sort((a, b) => a.threshold - b.threshold);

  if (this.tiers[0].threshold !== 0) {
    this.invalidate(
      "tiers",
      "Hạng thấp nhất phải có ngưỡng 0 để khách mới luôn thuộc một hạng"
    );
  }
  for (let i = 1; i < this.tiers.length; i += 1) {
    if (this.tiers[i].threshold === this.tiers[i - 1].threshold) {
      this.invalidate("tiers", "Các hạng không được trùng ngưỡng chi tiêu");
      break;
    }
    if (this.tiers[i].multiplier < this.tiers[i - 1].multiplier) {
      this.invalidate(
        "tiers",
        "Hạng cao hơn không được có hệ số tích điểm thấp hơn hạng dưới"
      );
      break;
    }
  }
});

// Cached view of the singleton. Every checkout preview and history render
// reads it, so it must answer from memory rather than hitting the database.
//
// Freshness trade-off mirrors roleRegistry: a write invalidates the cache on
// the instance that made it, other instances catch up within the TTL. Inside a
// transaction the cache is bypassed entirely — an order must never be priced
// with a rate the admin has already changed.
const CACHE_TTL_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

loyaltyProgramSchema.statics.invalidateCache = function () {
  cached = null;
  cachedAt = 0;
};

loyaltyProgramSchema.statics.getConfig = async function (options = {}) {
  const { session = null, bypassCache = false } = options;

  if (!session && !bypassCache && cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const query = this.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  if (session) query.session(session);
  const config = await query.lean();

  if (!session) {
    cached = config;
    cachedAt = Date.now();
  }
  return config;
};

const LoyaltyProgram = mongoose.model("LoyaltyProgram", loyaltyProgramSchema);
LoyaltyProgram.DEFAULT_TIERS = DEFAULT_TIERS;
module.exports = LoyaltyProgram;
