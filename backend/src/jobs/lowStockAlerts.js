const mongoose = require("mongoose");
const Book = require("../models/Book");
const config = require("../config");
const inventoryService = require("../services/inventoryService");
const notificationService = require("../services/notificationService");

const INTERVAL_MS = 15 * 60_000;
const MAX_BOOKS_PER_TICK = 50;
const COOLDOWN_MS = config.inventory.lowStockAlertCooldownMs;

let timer = null;
let running = false;
let app = null;

/**
 * Notify admins about books that have fallen to or below their reorder point.
 *
 * `lowStockAlertedAt` throttles the alert per book: a book that stays low is
 * re-announced only once the cooldown lapses, and the stamp is cleared as soon
 * as stock climbs back above the threshold so a genuine dip alerts again.
 */
async function tick(now = new Date()) {
  if (running || mongoose.connection.readyState !== 1) return 0;
  running = true;
  try {
    const cooledOffBefore = new Date(now.getTime() - COOLDOWN_MS);
    const books = await Book.find({
      ...inventoryService.lowStockFilter(),
      $and: [
        {
          $or: [
            { lowStockAlertedAt: null },
            { lowStockAlertedAt: { $lte: cooledOffBefore } },
          ],
        },
      ],
    })
      .select("title stock reorderPoint reorderQuantity defaultSupplier")
      .populate("defaultSupplier", "name")
      .sort({ stock: 1, _id: 1 })
      .limit(MAX_BOOKS_PER_TICK)
      .lean();

    if (!books.length) return 0;

    for (const book of books) {
      const decorated = inventoryService.decorateLowStock(book);
      const outOfStock = decorated.stock <= 0;
      const supplierHint = book.defaultSupplier?.name
        ? ` Nhà cung cấp: ${book.defaultSupplier.name}.`
        : "";
      await notificationService.notifyAdmins(
        {
          type: "stock",
          title: outOfStock ? "Sách đã hết hàng" : "Sách sắp hết hàng",
          message: outOfStock
            ? `"${book.title}" đã hết hàng. Đề nghị nhập ${decorated.suggestedQuantity} cuốn.${supplierHint}`
            : `"${book.title}" chỉ còn ${decorated.stock} cuốn (ngưỡng ${decorated.effectiveReorderPoint}). Đề nghị nhập ${decorated.suggestedQuantity} cuốn.${supplierHint}`,
          link: `/admin/inventory/low-stock`,
          metadata: {
            bookId: book._id,
            stock: decorated.stock,
            reorderPoint: decorated.effectiveReorderPoint,
            suggestedQuantity: decorated.suggestedQuantity,
          },
        },
        app
      );
    }

    await Book.updateMany(
      { _id: { $in: books.map((book) => book._id) } },
      { $set: { lowStockAlertedAt: now } }
    );

    return books.length;
  } catch (error) {
    console.error("[lowStockAlerts] Tick error:", error.message);
    return 0;
  } finally {
    running = false;
  }
}

/**
 * Clear the throttle stamp on books that have recovered, so the next genuine
 * dip alerts immediately instead of waiting out the cooldown.
 */
async function clearRecovered() {
  if (mongoose.connection.readyState !== 1) return 0;
  try {
    const result = await Book.updateMany(
      {
        lowStockAlertedAt: { $ne: null },
        $nor: [inventoryService.lowStockFilter()],
      },
      { $set: { lowStockAlertedAt: null } }
    );
    return result.modifiedCount || 0;
  } catch (error) {
    console.error("[lowStockAlerts] Recovery sweep error:", error.message);
    return 0;
  }
}

async function runOnce(now = new Date()) {
  await clearRecovered();
  return tick(now);
}

function start(expressApp) {
  if (timer) return;
  app = expressApp;
  void runOnce();
  timer = setInterval(() => {
    void runOnce();
  }, INTERVAL_MS);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  app = null;
}

module.exports = { INTERVAL_MS, clearRecovered, runOnce, start, stop, tick };
