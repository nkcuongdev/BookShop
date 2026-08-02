const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const Book = require("../models/Book");

// Rough trade margin for retail books. Only a stand-in: real cost comes from
// what a supplier actually charged, which only a goods receipt can record.
const COST_RATIO = Number(process.env.SEED_COST_RATIO || 0.65);

/**
 * Fill in an ESTIMATED cost price for books that have none.
 *
 * Development convenience, not a migration. Profit reporting, stock valuation
 * and margin figures all divide by cost, so a database where every book costs
 * zero reports 100% margin and makes those screens impossible to exercise.
 * This puts a plausible number there so the reports can be used.
 *
 * The number is invented. It is a flat percentage of the sale price, not
 * anything the shop actually paid, so it must never be run against production
 * data - real cost belongs to a goods receipt, which also feeds the
 * moving-average and leaves an auditable document behind.
 *
 * Only touches books with no cost at all, so a real figure entered later (or a
 * receipt posted against the book) is never overwritten.
 */
async function runOnce({ dryRun = false, ratio = COST_RATIO } = {}) {
  if (!(ratio > 0 && ratio < 1)) {
    throw new Error(`Cost ratio must be between 0 and 1, got ${ratio}`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed estimated cost prices in production - post a goods receipt instead"
    );
  }

  const filter = {
    $or: [{ costPrice: { $lte: 0 } }, { costPrice: null }, { costPrice: { $exists: false } }],
    price: { $gt: 0 },
  };
  const pending = await Book.find(filter).select("_id title price").lean();

  if (!pending.length) {
    console.log("[seedEstimatedCostPrice] Mọi sách đã có giá vốn");
    return 0;
  }

  console.log(
    `[seedEstimatedCostPrice] ${pending.length} sách chưa có giá vốn, ` +
      `sẽ ước tính = ${Math.round(ratio * 100)}% giá bán`
  );
  for (const book of pending.slice(0, 5)) {
    console.log(
      `    ${String(book.title).slice(0, 34).padEnd(36)} ` +
        `giá bán ${book.price.toLocaleString("vi-VN")}đ -> giá vốn ~${Math.round(
          book.price * ratio
        ).toLocaleString("vi-VN")}đ`
    );
  }
  if (pending.length > 5) console.log(`    ... và ${pending.length - 5} sách khác`);

  if (dryRun) {
    console.log("[seedEstimatedCostPrice] (dry-run, chưa ghi gì)");
    return pending.length;
  }

  const writes = pending.map((book) => ({
    updateOne: {
      filter: { _id: book._id },
      update: { $set: { costPrice: Math.round(book.price * ratio) } },
    },
  }));
  const result = await Book.bulkWrite(writes, { ordered: false });

  console.log(
    `[seedEstimatedCostPrice] Đã đặt giá vốn ƯỚC TÍNH cho ${result.modifiedCount} sách`
  );
  console.log(
    "[seedEstimatedCostPrice] LƯU Ý: đây là số ước lượng cho môi trường dev. " +
      "Khi vận hành thật, hãy nhập giá vốn qua phiếu nhập kho."
  );
  return result.modifiedCount;
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  connectDB()
    .then(() => runOnce({ dryRun }))
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Estimated cost seeding failed:", error.message);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { COST_RATIO, runOnce };
