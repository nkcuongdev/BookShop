const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const Book = require("../models/Book");

/**
 * Give every book a valid `status`.
 *
 * The field is an enum of "active"/"inactive" defaulting to "active", but
 * records written before it existed (or inserted straight through the driver,
 * which skips mongoose defaults) have no value at all. That is not a harmless
 * gap: every storefront query and the inventory valuation filter on
 * `status: "active"`, so an unset book silently disappears from both - it
 * cannot be bought, and its stock is missing from the reports.
 *
 * "active" is the right repair rather than a guess: it is the schema's own
 * default, so it is the value these records would have had if the field had
 * been set at all. Anything genuinely withdrawn from sale can be switched to
 * "inactive" from the admin screen afterwards.
 */
async function runOnce({ dryRun = false } = {}) {
  const filter = { status: { $nin: ["active", "inactive"] } };
  const pending = await Book.countDocuments(filter);

  if (!pending) {
    console.log("[backfillBookStatus] Mọi sách đã có trạng thái hợp lệ");
    return 0;
  }

  const sellable = await Book.countDocuments({ ...filter, sold: { $gt: 0 } });
  console.log(
    `[backfillBookStatus] ${pending} sách thiếu trạng thái ` +
      `(${sellable} trong số đó đã từng bán được)`
  );

  if (dryRun) {
    console.log(`[backfillBookStatus] Sẽ đặt status="active" cho ${pending} sách`);
    return pending;
  }

  const result = await Book.updateMany(filter, { $set: { status: "active" } });
  console.log(
    `[backfillBookStatus] Đã đặt status="active" cho ${result.modifiedCount} sách`
  );
  return result.modifiedCount;
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  connectDB()
    .then(() => runOnce({ dryRun }))
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Book status backfill failed:", error.message);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { runOnce };
