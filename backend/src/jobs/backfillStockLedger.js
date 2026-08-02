const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const backfillReservedStock = require("./backfillReservedStock");
const Book = require("../models/Book");
const StockLedger = require("../models/StockLedger");

const BATCH_SIZE = 500;

const OPENING_BALANCE_REASON = "Số dư đầu kỳ (khởi tạo sổ kho)";

/**
 * One-off migration: give every pre-existing book an opening-balance ledger
 * entry so the ledger total matches the book from day one.
 *
 * The balance is the *physical* figure, onHand (stock + reserved), not the
 * sellable one. Reconciliation checks two sums against two different fields:
 * every row except SHIP_OUT must add up to Book.stock, and every row except
 * SALE_OUT/RESERVE_IN must add up to onHand. An opening balance of `stock`
 * alone satisfies neither once a book has goods reserved for an unshipped
 * order, because those copies are on the shelf but already out of `stock`.
 *
 * Starting from onHand and letting the SALE_OUT rows (written by
 * backfillReservedStock) carry the reservation back out is what makes both
 * sums land: onHand - reserved = stock.
 *
 * Without this, reconcileStock would report every legacy book as drifted.
 * The job is idempotent — a book that already has ledger history is skipped, so
 * it is safe to re-run after a partial failure.
 */
async function runOnce({ dryRun = false } = {}) {
  // The opening balance is onHand, so Book.reserved has to be populated first.
  // Deriving it here rather than trusting run order means this job is correct
  // whichever way round the two migrations are invoked.
  await backfillReservedStock.runOnce({ dryRun });

  // Look for an existing opening balance specifically, not for any ledger row.
  // backfillReservedStock writes SALE_OUT/SHIP_OUT rows of its own, so treating
  // "has history" as "already has a balance" would make the two migrations
  // order-dependent and silently skip every book when they run the other way
  // round.
  const booksWithBalance = await StockLedger.distinct("book", {
    reason: OPENING_BALANCE_REASON,
  });
  const seen = new Set(booksWithBalance.map(String));

  const books = await Book.find({
    $or: [{ stock: { $gt: 0 } }, { reserved: { $gt: 0 } }],
  })
    .select("_id title stock reserved costPrice")
    .lean();

  const pending = books.filter((book) => !seen.has(String(book._id)));
  if (!pending.length) {
    console.log("[backfillStockLedger] Nothing to backfill");
    return 0;
  }

  if (dryRun) {
    console.log(
      `[backfillStockLedger] Would create ${pending.length} opening-balance entries`
    );
    return pending.length;
  }

  let created = 0;
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE).map((book) => ({
      book: book._id,
      type: "ADJUSTMENT",
      // Physical stock, so the copies held for unshipped orders are part of the
      // opening balance; their SALE_OUT rows take them back out of `stock`.
      quantity: Number(book.stock) + (Number(book.reserved) || 0),
      stockBefore: 0,
      stockAfter: Number(book.stock) + (Number(book.reserved) || 0),
      unitCost: Number(book.costPrice) || 0,
      reason: OPENING_BALANCE_REASON,
      performedBy: null,
    }));
    await StockLedger.insertMany(batch, { ordered: false });
    created += batch.length;
    console.log(`[backfillStockLedger] ${created}/${pending.length}`);
  }

  console.log(`[backfillStockLedger] Created ${created} opening-balance entries`);
  return created;
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  connectDB()
    .then(() => runOnce({ dryRun }))
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Stock ledger backfill failed:", error);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { runOnce };
