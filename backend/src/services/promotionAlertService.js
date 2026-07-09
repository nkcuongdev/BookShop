const Book = require("../models/Book");
const Promotion = require("../models/Promotion");
const PromotionAlertDelivery = require("../models/PromotionAlertDelivery");
const User = require("../models/User");
const notificationService = require("./notificationService");

const DELIVERY_LOCK_MS = 2 * 60_000;
const DELIVERY_CONCURRENCY = 10;

function isPromotionRunning(promotion, now = new Date()) {
  return Boolean(
    promotion?.active &&
      promotion.startDate <= now &&
      promotion.endDate >= now
  );
}

async function claimDelivery({ userId, promotionId, bookId }, now = new Date()) {
  const key = { user: userId, promotion: promotionId, book: bookId };
  try {
    return await PromotionAlertDelivery.create({
      ...key,
      status: "processing",
      lockedUntil: new Date(now.getTime() + DELIVERY_LOCK_MS),
      attempts: 1,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const existing = await PromotionAlertDelivery.findOne(key).lean();
  if (!existing) return { busy: true };
  if (existing.status === "completed") return { completed: true };
  if (
    existing.status === "processing" &&
    existing.lockedUntil &&
    existing.lockedUntil > now
  ) {
    return { busy: true };
  }
  const claimed = await PromotionAlertDelivery.findOneAndUpdate(
    {
      ...key,
      status: { $ne: "completed" },
      $or: [
        { status: "pending" },
        { status: "processing", lockedUntil: { $lte: now } },
        { status: "processing", lockedUntil: null },
      ],
    },
    {
      $set: {
        status: "processing",
        lockedUntil: new Date(now.getTime() + DELIVERY_LOCK_MS),
        lastError: "",
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after" }
  );
  return claimed || { busy: true };
}

function formatVnd(value) {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

async function deliverPromotionAlert({ userId, promotion, book, appOrReq, now }) {
  const claimed = await claimDelivery(
    { userId, promotionId: promotion._id, bookId: book._id },
    now
  );
  if (claimed.completed) return "completed";
  if (claimed.busy) return "busy";

  const salePrice = promotion.computePrice(book.price);
  const discountPercent =
    book.price > 0
      ? Math.round(((book.price - salePrice) / book.price) * 100)
      : 0;
  if (salePrice >= book.price || discountPercent <= 0) {
    await PromotionAlertDelivery.updateOne(
      { _id: claimed._id },
      { $set: { status: "completed", completedAt: now, lockedUntil: null } }
    );
    return "completed";
  }

  try {
    await notificationService.notifyUser(
      userId,
      {
        type: "promotion",
        title: "Sách yêu thích đang giảm giá",
        message: `${book.title} đang giảm ${discountPercent}%, chỉ còn ${formatVnd(salePrice)}.`,
        link: `/books/${book._id}`,
        metadata: {
          promotionId: promotion._id,
          bookId: book._id,
          originalPrice: book.price,
          salePrice,
          discountPercent,
          endDate: promotion.endDate,
        },
      },
      appOrReq
    );
    await PromotionAlertDelivery.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "completed",
          completedAt: new Date(),
          lockedUntil: null,
          lastError: "",
        },
      }
    );
    return "delivered";
  } catch (error) {
    await PromotionAlertDelivery.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "pending",
          lockedUntil: null,
          lastError: String(error.message || error).slice(0, 500),
        },
      }
    );
    return "failed";
  }
}

async function runWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(DELIVERY_CONCURRENCY, items.length) },
      () => run()
    )
  );
  return results;
}

async function promotionBooks(promotion) {
  const filter =
    promotion.scope === "products"
      ? { _id: { $in: promotion.books || [] }, status: "active" }
      : { category: promotion.category, status: "active" };
  return Book.find(filter).select("title price category").lean();
}

async function booksDiscountedByPromotion(promotion, books, now) {
  if (!books.length) return books;
  const otherPromotions = await Promotion.find({
    _id: { $ne: promotion._id },
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).select("type value scope books category");

  return books.filter((book) => {
    const currentPrice = promotion.computePrice(book.price);
    let bestOtherPrice = book.price;
    let bestOtherId = "";
    for (const other of otherPromotions) {
      if (!other.appliesTo(book)) continue;
      const otherPrice = other.computePrice(book.price);
      if (
        otherPrice < bestOtherPrice ||
        (otherPrice === bestOtherPrice &&
          (!bestOtherId || String(other._id) < bestOtherId))
      ) {
        bestOtherPrice = otherPrice;
        bestOtherId = String(other._id);
      }
    }
    return (
      currentPrice < bestOtherPrice ||
      (currentPrice === bestOtherPrice &&
        currentPrice < book.price &&
        String(promotion._id) < bestOtherId)
    );
  });
}

async function processPromotionWishlistAlerts(
  promotionOrId,
  appOrReq = null,
  now = new Date()
) {
  const promotion =
    typeof promotionOrId?.isRunning === "function"
      ? promotionOrId
      : await Promotion.findById(promotionOrId);
  if (!promotion || !isPromotionRunning(promotion, now)) {
    return { processed: false, deliveredCount: 0, failedCount: 0 };
  }

  const targetedBooks = await promotionBooks(promotion);
  const books = await booksDiscountedByPromotion(
    promotion,
    targetedBooks,
    now
  );
  const bookById = new Map(books.map((book) => [String(book._id), book]));
  const watchers = books.length
    ? await User.find({
        status: "active",
        wishlist: { $in: books.map((book) => book._id) },
      })
        .select("wishlist")
        .lean()
    : [];
  const deliveries = [];
  for (const watcher of watchers) {
    for (const bookId of watcher.wishlist || []) {
      const book = bookById.get(String(bookId));
      if (book) deliveries.push({ userId: watcher._id, book });
    }
  }

  const results = await runWithConcurrency(deliveries, ({ userId, book }) =>
    deliverPromotionAlert({ userId, promotion, book, appOrReq, now })
  );
  const failedCount = results.filter((result) => result === "failed").length;
  const busyCount = results.filter((result) => result === "busy").length;
  if (!failedCount && !busyCount) {
    await Promotion.updateOne(
      { _id: promotion._id, updatedAt: promotion.updatedAt },
      { $set: { wishlistAlertProcessedAt: new Date() } }
    );
  }
  return {
    processed: !failedCount && !busyCount,
    deliveredCount: results.filter((result) => result === "delivered").length,
    failedCount,
    busyCount,
  };
}

module.exports = {
  deliverPromotionAlert,
  isPromotionRunning,
  processPromotionWishlistAlerts,
};
