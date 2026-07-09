const Book = require("../models/Book");
const Order = require("../models/Order");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const Promotion = require("../models/Promotion");
const User = require("../models/User");
const ReturnRequest = require("../models/ReturnRequest");
const { toPublicBooks } = require("../serializers/bookSerializer");

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 365;
const MAX_EVENT_GROUPS = 200;
const MAX_ORDERS = 100;
const MAX_CANDIDATES = 240;
const PURCHASE_STATUSES = [
  Order.STATUS.PAID,
  Order.STATUS.PROCESSING,
  Order.STATUS.SHIPPED,
  Order.STATUS.DELIVERED,
];
const EVENT_WEIGHTS = Object.freeze({
  product_view: 1,
  add_to_cart: 2.5,
  cart_update: 2,
});

function recencyWeight(date, halfLifeDays) {
  const timestamp = new Date(date || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0.1;
  const ageDays = Math.max(0, (Date.now() - timestamp) / DAY_MS);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function addScore(map, key, score) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey || !Number.isFinite(score) || score <= 0) return;
  map.set(normalizedKey, (map.get(normalizedKey) || 0) + score);
}

function publicBookFields() {
  return {
    title: 1,
    author: 1,
    description: 1,
    price: 1,
    imageUrl: 1,
    category: 1,
    tags: 1,
    stock: 1,
    sold: 1,
    rating: 1,
    reviewCount: 1,
    createdAt: 1,
  };
}

async function loadEventSignals({ userId, sessionId, cutoff }) {
  const identities = [];
  if (userId) identities.push({ user: userId });
  if (sessionId) identities.push({ sessionId });
  if (!identities.length) return [];

  return AnalyticsEvent.aggregate([
    {
      $match: {
        $or: identities,
        type: { $in: Object.keys(EVENT_WEIGHTS) },
        book: { $ne: null },
        createdAt: { $gte: cutoff },
      },
    },
    {
      $group: {
        _id: { book: "$book", type: "$type" },
        count: { $sum: 1 },
        lastAt: { $max: "$createdAt" },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: MAX_EVENT_GROUPS },
  ]);
}

async function loadPurchaseSignals({ userId, cutoff }) {
  if (!userId) return [];
  return Order.find({
    user: userId,
    status: { $in: PURCHASE_STATUSES },
    placedAt: { $gte: cutoff },
  })
    .select("items.book items.quantity placedAt")
    .sort({ placedAt: -1 })
    .limit(MAX_ORDERS)
    .lean();
}

function buildSignals(eventGroups, orders, returnRequests = [], wishlist = []) {
  const signals = new Map();
  const purchasedIds = new Set();
  let viewCount = 0;
  let purchaseCount = 0;
  const returnedByOrderAndBook = new Map();

  for (const request of returnRequests) {
    for (const item of request.items || []) {
      const key = `${request.order}:${item.book}`;
      returnedByOrderAndBook.set(
        key,
        (returnedByOrderAndBook.get(key) || 0) + (Number(item.quantity) || 0)
      );
    }
  }

  const addSignal = (bookId, score) => {
    const key = String(bookId || "");
    if (!key || !Number.isFinite(score) || score <= 0) return;
    signals.set(key, (signals.get(key) || 0) + score);
  };

  for (const event of eventGroups) {
    const type = event?._id?.type;
    const base = EVENT_WEIGHTS[type] || 0;
    const count = Math.max(1, Number(event.count) || 1);
    const score =
      base *
      (1 + Math.log2(count)) *
      recencyWeight(event.lastAt, type === "product_view" ? 45 : 75);
    addSignal(event?._id?.book, score);
    if (type === "product_view") viewCount += count;
  }

  for (const order of orders) {
    const decay = recencyWeight(order.placedAt, 180);
    for (const item of order.items || []) {
      const bookId = String(item.book || "");
      if (!bookId) continue;
      const returned = returnedByOrderAndBook.get(`${order._id}:${bookId}`) || 0;
      const remaining = Math.max(0, (Number(item.quantity) || 0) - returned);
      if (remaining <= 0) continue;
      const quantity = Math.max(1, Math.min(5, remaining));
      addSignal(bookId, 6 * (1 + Math.log2(quantity)) * decay);
      purchasedIds.add(bookId);
      purchaseCount += quantity;
    }
  }

  for (const bookId of wishlist) {
    addSignal(bookId, 4);
  }

  return { signals, purchasedIds, viewCount, purchaseCount };
}

function buildTasteProfile(seedBooks, signals) {
  const categories = new Map();
  const authors = new Map();
  const tags = new Map();

  for (const book of seedBooks) {
    const signal = signals.get(String(book._id)) || 0;
    addScore(categories, book.category, signal);
    addScore(authors, book.author, signal * 0.8);
    for (const tag of book.tags || []) addScore(tags, tag, signal * 0.45);
  }

  return { categories, authors, tags };
}

function candidateReason(book, profile) {
  if (profile.authors.has(String(book.author || "").trim())) {
    return "Cùng tác giả với sách bạn quan tâm";
  }
  if (profile.categories.has(String(book.category || "").trim())) {
    return "Hợp với thể loại bạn thường xem và mua";
  }
  if ((book.tags || []).some((tag) => profile.tags.has(String(tag).trim()))) {
    return "Phù hợp với chủ đề bạn quan tâm";
  }
  return "Được nhiều độc giả lựa chọn";
}

function scoreCandidate(book, profile) {
  let score = 0;
  score += (profile.categories.get(String(book.category || "").trim()) || 0) * 1.4;
  score += (profile.authors.get(String(book.author || "").trim()) || 0) * 1.15;
  for (const tag of book.tags || []) {
    score += profile.tags.get(String(tag).trim()) || 0;
  }

  // Popularity only breaks ties; it must not overpower actual taste signals.
  score += Math.log1p(Math.max(0, Number(book.sold) || 0)) * 0.12;
  score += Math.max(0, Number(book.rating) || 0) * 0.08;
  score += Math.log1p(Math.max(0, Number(book.reviewCount) || 0)) * 0.04;
  return score;
}

async function popularFallback({ excludeIds, limit }) {
  return Book.find({
    status: "active",
    stock: { $gt: 0 },
    ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}),
  }, publicBookFields())
    .sort({ sold: -1, rating: -1, reviewCount: -1, createdAt: -1, _id: 1 })
    .limit(limit)
    .lean();
}

async function getRecommendations({ userId = null, sessionId = "", limit = 10 } = {}) {
  const cutoff = new Date(Date.now() - HISTORY_DAYS * DAY_MS);
  const [eventGroups, orders, customer] = await Promise.all([
    loadEventSignals({ userId, sessionId, cutoff }),
    loadPurchaseSignals({ userId, cutoff }),
    userId ? User.findById(userId).select("wishlist").lean() : null,
  ]);
  const returns = orders.length
    ? await ReturnRequest.find({
        order: { $in: orders.map((order) => order._id) },
        status: { $in: [ReturnRequest.STATUS.RECEIVED, ReturnRequest.STATUS.CLOSED] },
      })
        .select("order items.book items.quantity")
        .lean()
    : [];
  const { signals, purchasedIds, viewCount, purchaseCount } = buildSignals(
    eventGroups,
    orders,
    returns,
    customer?.wishlist || []
  );
  const sourceIds = [...signals.keys()];

  if (!sourceIds.length) {
    const books = await popularFallback({ excludeIds: [], limit });
    return {
      books: toPublicBooks(await Promotion.decorateBooks(books)),
      personalized: false,
      basis: { views: 0, purchases: 0 },
    };
  }

  const seedBooks = await Book.find(
    { _id: { $in: sourceIds } },
    { author: 1, category: 1, tags: 1 }
  ).lean();
  const profile = buildTasteProfile(seedBooks, signals);
  const strongest = (scores, limit = 4) =>
    [...scores.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([value]) => value);
  // Separate buckets prevent one prolific category/author from consuming the
  // entire candidate budget before personalization is scored.
  const affinityFilters = [
    ...strongest(profile.categories).map((category) => ({ category })),
    ...strongest(profile.authors).map((author) => ({ author })),
    ...strongest(profile.tags).map((tag) => ({ tags: tag })),
  ];

  const excludedIds = [...new Set([...sourceIds, ...purchasedIds])];
  let candidates = [];
  if (affinityFilters.length) {
    const base = {
      status: "active",
      stock: { $gt: 0 },
      _id: { $nin: excludedIds },
    };
    const perBucket = Math.max(
      12,
      Math.floor(MAX_CANDIDATES / (affinityFilters.length + 1))
    );
    const buckets = await Promise.all([
      ...affinityFilters.map((filter) =>
        Book.find({ ...base, ...filter }, publicBookFields())
          .sort({ createdAt: -1, sold: 1, _id: 1 })
          .limit(perBucket)
          .lean()
      ),
      Book.find(base, publicBookFields())
        .sort({ createdAt: -1, sold: 1, _id: 1 })
        .limit(perBucket)
        .lean(),
    ]);
    candidates = [
      ...new Map(
        buckets.flat().map((book) => [String(book._id), book])
      ).values(),
    ];
  }

  const ranked = candidates
    .map((book) => ({
      ...book,
      recommendationReason: candidateReason(book, profile),
      recommendationScore: scoreCandidate(book, profile),
    }))
    .sort(
      (left, right) =>
        right.recommendationScore - left.recommendationScore ||
        Number(right.sold || 0) - Number(left.sold || 0) ||
        String(left._id).localeCompare(String(right._id))
    )
    .slice(0, limit)
    .map(({ recommendationScore: _recommendationScore, ...book }) => book);

  if (ranked.length < limit) {
    const rankedIds = ranked.map((book) => String(book._id));
    const fallback = await popularFallback({
      excludeIds: [...excludedIds, ...rankedIds],
      limit: limit - ranked.length,
    });
    ranked.push(
      ...fallback.map((book) => ({
        ...book,
        recommendationReason: "Được nhiều độc giả lựa chọn",
      }))
    );
  }

  return {
    books: toPublicBooks(await Promotion.decorateBooks(ranked)),
    personalized: candidates.length > 0,
    basis: { views: viewCount, purchases: purchaseCount },
  };
}

module.exports = {
  getRecommendations,
};
