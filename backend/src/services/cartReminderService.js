const crypto = require("crypto");
const Book = require("../models/Book");
const Cart = require("../models/Cart");
const CartReminderDelivery = require("../models/CartReminderDelivery");
const Order = require("../models/Order");
const Promotion = require("../models/Promotion");
const User = require("../models/User");
const config = require("../config");
const notificationService = require("./notificationService");
const { sendCartReminderEmail } = require("./emailService");
const {
  normalizeNotificationPreferences,
} = require("../utils/notificationPreferences");

const DELIVERY_LOCK_MS = 2 * 60_000;
const DELIVERY_CONCURRENCY = 5;
const ACTIVE_ORDER_STATUSES = ["PENDING", "PAID", "PROCESSING"];

/**
 * Fingerprint of what is actually in the cart. Two reminders carrying the same
 * signature are the same nudge; changing the cart (adding, removing, or
 * changing a quantity) yields a new signature and re-arms the reminder cycle.
 */
function cartSignature(items = []) {
  const normalized = items
    .map((item) => `${String(item.book?._id || item.book)}:${item.quantity}`)
    .sort()
    .join("|");
  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Which reminder is due for a cart last touched at `lastActivityAt`.
 * Returns 0 when the cart is either too fresh or too cold to chase.
 */
function dueStage(lastActivityAt, now = new Date()) {
  const idleMs = now.getTime() - new Date(lastActivityAt).getTime();
  if (idleMs > config.cartReminder.maxAgeMs) return 0;
  const secondAfter = config.cartReminder.secondReminderAfterMs;
  if (secondAfter > 0 && idleMs >= secondAfter) return 2;
  if (idleMs >= config.cartReminder.idleAfterMs) return 1;
  return 0;
}

/**
 * Claim the (user, cart, stage) slot so two workers cannot both mail the same
 * shopper. Mirrors the promotion-alert claim: the unique index makes the insert
 * itself the lock, and a stale `processing` row is re-claimable once its lease
 * lapses, so a crashed worker does not strand the reminder.
 */
async function claimDelivery({ userId, signature, stage }, now = new Date()) {
  const key = { user: userId, cartSignature: signature, stage };
  try {
    return await CartReminderDelivery.create({
      ...key,
      status: "processing",
      lockedUntil: new Date(now.getTime() + DELIVERY_LOCK_MS),
      attempts: 1,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const existing = await CartReminderDelivery.findOne(key).lean();
  if (!existing) return { busy: true };
  if (existing.status === "completed") return { completed: true };
  if (
    existing.status === "processing" &&
    existing.lockedUntil &&
    existing.lockedUntil > now
  ) {
    return { busy: true };
  }
  const claimed = await CartReminderDelivery.findOneAndUpdate(
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

/**
 * Price the cart the way the cart API does, so the email never quotes a figure
 * the shopper will not see on the site. Books that went inactive or out of
 * stock are dropped: chasing someone with a book they cannot buy is worse than
 * staying quiet.
 */
async function priceCart(items) {
  const bookIds = items.map((item) => item.book).filter(Boolean);
  if (!bookIds.length) return { items: [], itemCount: 0, totalAmount: 0 };

  const books = await Book.find({
    _id: { $in: bookIds },
    status: "active",
    stock: { $gt: 0 },
  })
    .select("title price imageUrl category stock")
    .lean();
  if (!books.length) return { items: [], itemCount: 0, totalAmount: 0 };

  const decorated = await Promotion.decorateBooks(books);
  const byId = new Map(
    decorated.map((book) => [String(book._id || book.id), book])
  );

  const priced = [];
  for (const item of items) {
    const book = byId.get(String(item.book));
    if (!book) continue;
    const quantity = Math.min(Number(item.quantity) || 0, book.stock);
    if (quantity < 1) continue;
    priced.push({
      bookId: String(book._id || book.id),
      title: book.title,
      imageUrl: book.imageUrl,
      price: Number(book.price) || 0,
      quantity,
    });
  }

  return {
    items: priced,
    itemCount: priced.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: priced.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    ),
  };
}

/**
 * A shopper who ordered after their last cart change has already converted, so
 * the leftover rows are not an abandonment worth chasing.
 */
async function hasRecentOrder(userId, since) {
  const order = await Order.findOne({
    user: userId,
    status: { $in: ACTIVE_ORDER_STATUSES },
    createdAt: { $gte: since },
  })
    .select("_id")
    .lean();
  return Boolean(order);
}

/**
 * Reminders ride on the existing `promotion` notification preference, so a
 * shopper who already opted out of marketing is not mailed by a new channel
 * they never agreed to.
 */
function reminderRecipient(user) {
  if (!user || user.status !== "active") return null;
  // Unverified addresses are never mailed, matching notificationService.
  if (!user.emailVerifiedAt) return null;
  const preferences = normalizeNotificationPreferences(
    user.notificationPreferences
  );
  return {
    email: preferences.email.promotion ? user.email : "",
    inApp: preferences.inApp.promotion,
  };
}

function finishDelivery(deliveryId, patch) {
  return CartReminderDelivery.updateOne({ _id: deliveryId }, { $set: patch });
}

/**
 * Send the reminder for one cart. Returns a short outcome string so the job can
 * report what happened without re-reading the collection.
 */
async function remindCart(cart, appOrReq = null, now = new Date()) {
  const stage = dueStage(cart.updatedAt, now);
  if (!stage) return "skipped";

  const signature = cartSignature(cart.items);
  const claimed = await claimDelivery(
    { userId: cart.user, signature, stage },
    now
  );
  if (claimed.completed) return "completed";
  if (claimed.busy) return "busy";

  try {
    const user = await User.findById(cart.user)
      .select("name email emailVerifiedAt notificationPreferences status")
      .lean();
    const recipient = reminderRecipient(user);
    if (!recipient) {
      await finishDelivery(claimed._id, {
        status: "completed",
        completedAt: now,
        lockedUntil: null,
      });
      return "suppressed";
    }

    if (await hasRecentOrder(cart.user, cart.updatedAt)) {
      await finishDelivery(claimed._id, {
        status: "completed",
        completedAt: now,
        lockedUntil: null,
      });
      return "converted";
    }

    const priced = await priceCart(cart.items);
    if (!priced.items.length) {
      await finishDelivery(claimed._id, {
        status: "completed",
        completedAt: now,
        lockedUntil: null,
      });
      return "empty";
    }

    const visible = priced.items.slice(0, config.cartReminder.maxItemsPerEmail);
    let emailDelivered = false;
    if (recipient.email) {
      const result = await sendCartReminderEmail(recipient.email, {
        items: visible,
        itemCount: priced.itemCount,
        totalAmount: priced.totalAmount,
        recipientName: user.name,
        stage,
        hiddenCount: priced.items.length - visible.length,
        unsubscribeUrl: `${config.frontendUrl.replace(/\/$/, "")}/profile/notifications`,
      });
      emailDelivered = Boolean(result?.delivered);
    }

    if (recipient.inApp) {
      await notificationService
        .notifyUser(
          cart.user,
          {
            type: "promotion",
            title:
              stage > 1
                ? "Giỏ hàng vẫn đang chờ bạn"
                : "Bạn bỏ quên sách trong giỏ hàng",
            message: `Giỏ hàng của bạn còn ${priced.itemCount} sản phẩm, tạm tính ${new Intl.NumberFormat("vi-VN").format(priced.totalAmount)}đ.`,
            link: "/cart",
            metadata: {
              cartReminderStage: stage,
              itemCount: priced.itemCount,
              totalAmount: priced.totalAmount,
            },
          },
          appOrReq
        )
        .catch(() => null);
    }

    await finishDelivery(claimed._id, {
      status: "completed",
      completedAt: new Date(),
      lockedUntil: null,
      lastError: "",
      itemCount: priced.itemCount,
      totalAmount: priced.totalAmount,
      emailDelivered,
    });
    return "delivered";
  } catch (error) {
    await finishDelivery(claimed._id, {
      status: "pending",
      lockedUntil: null,
      lastError: String(error.message || error).slice(0, 500),
    }).catch(() => null);
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
    Array.from({ length: Math.min(DELIVERY_CONCURRENCY, items.length) }, () =>
      run()
    )
  );
  return results;
}

/**
 * Find carts that have gone quiet and nudge their owners.
 */
async function processAbandonedCarts(appOrReq = null, now = new Date()) {
  const summary = { scanned: 0, delivered: 0, skipped: 0, failed: 0 };
  if (!config.cartReminder.enabled) return summary;

  const idleBefore = new Date(now.getTime() - config.cartReminder.idleAfterMs);
  const coldBefore = new Date(now.getTime() - config.cartReminder.maxAgeMs);
  const carts = await Cart.find({
    "items.0": { $exists: true },
    updatedAt: { $lte: idleBefore, $gt: coldBefore },
  })
    .select("user items updatedAt")
    .sort({ updatedAt: 1, _id: 1 })
    .limit(config.cartReminder.maxCartsPerTick)
    .lean();

  summary.scanned = carts.length;
  if (!carts.length) return summary;

  const results = await runWithConcurrency(carts, (cart) =>
    remindCart(cart, appOrReq, now)
  );
  for (const result of results) {
    if (result === "delivered") summary.delivered += 1;
    else if (result === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }
  return summary;
}

module.exports = {
  cartSignature,
  dueStage,
  processAbandonedCarts,
  remindCart,
};
