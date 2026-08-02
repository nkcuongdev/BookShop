const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const Book = require("../models/Book");
const Order = require("../models/Order");
const StockLedger = require("../models/StockLedger");

const BATCH_SIZE = 200;

/**
 * One-off migration: fill in items.costPrice on orders placed before the field
 * existed, so the profit report does not read them as 100% margin.
 *
 * The cost is recovered from the stock ledger. Every sale writes a SALE_OUT row
 * carrying refId = the order and the moving-average unitCost in effect at the
 * time, which is exactly the number the order would have snapshotted.
 *
 * Orders with no matching ledger row — placed before the ledger existed — fall
 * back to the book's current costPrice. That is an approximation, not history:
 * it is the best available number, and it is still better than zero.
 *
 * The job is idempotent. An item that already has a non-zero costPrice is left
 * alone, so a partial run can simply be repeated.
 */
async function runOnce({ dryRun = false } = {}) {
  const filter = {
    "items.costPrice": { $in: [0, null] },
  };

  const total = await Order.countDocuments(filter);
  if (!total) {
    console.log("[backfillOrderCostPrice] Nothing to backfill");
    return { orders: 0, items: 0, fromLedger: 0, fromBook: 0 };
  }

  if (dryRun) {
    console.log(`[backfillOrderCostPrice] Would inspect ${total} orders`);
    return { orders: total, items: 0, fromLedger: 0, fromBook: 0 };
  }

  const stats = { orders: 0, items: 0, fromLedger: 0, fromBook: 0 };
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    await Order.bulkWrite(batch, { ordered: false });
    batch = [];
    console.log(`[backfillOrderCostPrice] ${stats.orders}/${total}`);
  };

  const cursor = Order.find(filter).select("_id items").lean().cursor();
  for await (const order of cursor) {
    // One ledger read per order: the SALE_OUT rows booked against it.
    const ledgerRows = await StockLedger.find({
      refType: "Order",
      refId: order._id,
      type: "SALE_OUT",
    })
      .select("book unitCost")
      .lean();
    const costByBook = new Map(
      ledgerRows.map((row) => [String(row.book), Number(row.unitCost) || 0])
    );

    const missingBookIds = (order.items || [])
      .filter(
        (item) =>
          !(Number(item.costPrice) > 0) && !costByBook.get(String(item.book))
      )
      .map((item) => item.book);

    if (missingBookIds.length) {
      const books = await Book.find({ _id: { $in: missingBookIds } })
        .select("_id costPrice")
        .lean();
      for (const book of books) {
        const cost = Number(book.costPrice) || 0;
        if (cost > 0) costByBook.set(String(book._id), cost);
      }
    }

    const updates = {};
    (order.items || []).forEach((item, index) => {
      if (Number(item.costPrice) > 0) return;
      const cost = costByBook.get(String(item.book)) || 0;
      if (!cost) return;
      updates[`items.${index}.costPrice`] = cost;
      stats.items += 1;
      if (ledgerRows.some((row) => String(row.book) === String(item.book))) {
        stats.fromLedger += 1;
      } else {
        stats.fromBook += 1;
      }
    });

    stats.orders += 1;
    if (!Object.keys(updates).length) continue;

    batch.push({
      updateOne: { filter: { _id: order._id }, update: { $set: updates } },
    });
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(
    `[backfillOrderCostPrice] Updated ${stats.items} items across ${stats.orders} orders ` +
      `(${stats.fromLedger} from ledger, ${stats.fromBook} from current book cost)`
  );
  return stats;
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  connectDB()
    .then(() => runOnce({ dryRun }))
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Order cost backfill failed:", error);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { runOnce };
