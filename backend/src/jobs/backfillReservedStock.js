const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const Book = require("../models/Book");
const Order = require("../models/Order");
const StockLedger = require("../models/StockLedger");

const BATCH_SIZE = 500;


// Orders whose goods are committed but have not left the warehouse. Placing an
// order decrements Book.stock right away, so these copies are missing from the
// sellable figure while still sitting on the shelf - which is exactly what
// Book.reserved is for. SHIPPED and later are gone; CANCELLED/FAILED already
// had their stock returned.
const RESERVING_ORDER_STATUSES = ["PENDING", "PAID", "PROCESSING", "CANCELLING"];

/**
 * One-off migration for the stock/reserved/onHand split: derive Book.reserved
 * from the orders currently holding goods.
 *
 * Before this field existed, an unshipped order left no trace on the book, so
 * a stocktake counting the shelf would find copies the system thought were
 * gone. This reconstructs the reservation for every book from live order data.
 *
 * Idempotent: reserved is set to the derived figure rather than incremented, so
 * re-running converges on the same answer. Book.stock is deliberately left
 * alone - it is already correct, and onHand grows by the reserved amount, which
 * is the point of the migration.
 */
async function runOnce({ dryRun = false } = {}) {
  const rows = await Order.aggregate([
    { $match: { status: { $in: RESERVING_ORDER_STATUSES } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.book", quantity: { $sum: "$items.quantity" } } },
    { $match: { quantity: { $gt: 0 } } },
  ]);

  const derived = new Map(rows.map((row) => [String(row._id), row.quantity]));

  // Books currently carrying a reservation that no live order justifies must be
  // cleared, or their onHand stays permanently inflated.
  const stale = await Book.find({ reserved: { $gt: 0 } })
    .select("_id")
    .lean();
  for (const book of stale) {
    if (!derived.has(String(book._id))) derived.set(String(book._id), 0);
  }

  if (!derived.size) {
    console.log("[backfillReservedStock] Nothing to backfill");
    return 0;
  }

  const writes = [...derived].map(([bookId, quantity]) => ({
    updateOne: {
      filter: { _id: bookId, reserved: { $ne: quantity } },
      update: { $set: { reserved: quantity } },
    },
  }));

  if (dryRun) {
    console.log(
      `[backfillReservedStock] Would set reserved on up to ${writes.length} book(s)`
    );
    // Keep going rather than returning: the dispatch pass below is the other
    // half of the migration, and a preview that hides it is misleading.
    await backfillOrderFlowRows({ dryRun });
    return writes.length;
  }

  let updated = 0;
  for (let index = 0; index < writes.length; index += BATCH_SIZE) {
    const batch = writes.slice(index, index + BATCH_SIZE);
    const result = await Book.bulkWrite(batch, { ordered: false });
    updated += result.modifiedCount || 0;
    console.log(
      `[backfillReservedStock] ${Math.min(index + BATCH_SIZE, writes.length)}/${writes.length}`
    );
  }

  console.log(`[backfillReservedStock] Updated reserved on ${updated} book(s)`);
  await backfillOrderFlowRows({ dryRun });
  return updated;
}

/**
 * Write the SALE_OUT rows for orders that are still holding goods.
 *
 * The opening balance created by backfillStockLedger is the *physical* figure
 * (onHand), because that is what a stocktake would find on the shelf. Sellable
 * stock is that balance minus whatever is committed to unshipped orders, so
 * each of those reservations needs its SALE_OUT row or the sellable total comes
 * out too high.
 *
 * Historical dispatches deliberately get nothing. It is tempting to write a
 * SHIP_OUT for every delivered order, but the opening balance is taken from
 * today's stock, which already has those dispatches subtracted from it -
 * booking them again would take the goods out twice on the physical side.
 * Pre-ledger history is summarised by the balance, not replayed.
 *
 * Idempotent: an order that already has its SALE_OUT rows is skipped.
 */
async function backfillOrderFlowRows({ dryRun = false } = {}) {
  const alreadyBooked = await StockLedger.distinct("refId", {
    type: "SALE_OUT",
    refType: "Order",
  });
  const booked = new Set(alreadyBooked.map(String));

  const orders = await Order.find({
    status: { $in: RESERVING_ORDER_STATUSES },
  })
    .select("_id orderCode items.book items.quantity createdAt")
    .lean();

  const rows = [];
  for (const order of orders) {
    if (booked.has(String(order._id))) continue;
    for (const item of order.items || []) {
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) continue;
      rows.push({
        book: item.book,
        type: "SALE_OUT",
        quantity: -quantity,
        // The historical before/after figures are not recoverable per line, and
        // reconciliation only sums `quantity`, so these stay zeroed rather than
        // inventing numbers that look authoritative.
        stockBefore: 0,
        stockAfter: 0,
        unitCost: 0,
        refType: "Order",
        refId: order._id,
        refCode: order.orderCode || "",
        reason: "Giữ hàng cho đơn chưa giao (bổ sung sổ kho)",
        performedBy: null,
        createdAt: order.createdAt || undefined,
      });
    }
  }

  if (!rows.length) {
    console.log("[backfillReservedStock] No reservation rows to backfill");
    return 0;
  }

  if (dryRun) {
    console.log(
      `[backfillReservedStock] Would create ${rows.length} SALE_OUT row(s)`
    );
    return rows.length;
  }

  let created = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    await StockLedger.insertMany(batch, { ordered: false });
    created += batch.length;
    console.log(`[backfillReservedStock] ${created}/${rows.length} reservation rows`);
  }

  console.log(`[backfillReservedStock] Created ${created} SALE_OUT row(s)`);
  return created;
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  connectDB()
    .then(() => runOnce({ dryRun }))
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Reserved stock backfill failed:", error);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = {
  RESERVING_ORDER_STATUSES,
  backfillOrderFlowRows,
  runOnce,
};
