const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const Book = require("../models/Book");
const StockLedger = require("../models/StockLedger");

// Rows a migration wrote, as opposed to rows real warehouse activity produced.
// Only these are safe to clear: everything else is history the ledger is
// supposed to keep forever.
const MIGRATION_REASONS = [
  "Số dư đầu kỳ (khởi tạo sổ kho)",
  "Giữ hàng cho đơn chưa giao (bổ sung sổ kho)",
  "Bàn giao vận chuyển (bổ sung sổ kho)",
  // Written by an earlier, incorrect version of the reserved-stock migration.
  "Đối ứng số dư đầu kỳ cho đơn đã giao (bổ sung sổ kho)",
];

/**
 * Undo the stock migrations so they can be re-run from a clean slate.
 *
 * Only for recovering from a migration that produced wrong numbers. It deletes
 * ledger rows, which the model otherwise forbids outright - the ledger is
 * append-only precisely so history cannot be rewritten - so it goes through the
 * raw driver and is deliberately narrow:
 *
 *   - it only removes rows whose `reason` matches one a migration wrote, so
 *     real movements (sales, receipts, stocktakes) are never touched;
 *   - it refuses to run at all if any other row exists, rather than guessing
 *     which of a mixed history is safe to drop.
 *
 * Book.reserved is reset alongside, since backfillReservedStock derives it from
 * live orders and will rebuild it on the next run.
 */
async function runOnce({ dryRun = false } = {}) {
  const migrationFilter = { reason: { $in: MIGRATION_REASONS } };
  const total = await StockLedger.countDocuments();
  const fromMigration = await StockLedger.countDocuments(migrationFilter);
  const other = total - fromMigration;

  console.log(
    `[resetStockLedger] Sổ kho có ${total} dòng: ${fromMigration} do migration, ${other} từ hoạt động thật`
  );

  if (other > 0) {
    console.error(
      "[resetStockLedger] Có dòng sổ kho không phải do migration tạo. " +
        "Không xoá gì cả — hãy kiểm tra thủ công trước."
    );
    throw new Error("Ledger contains real movement history; refusing to reset");
  }

  const reservedBooks = await Book.countDocuments({ reserved: { $gt: 0 } });
  if (dryRun) {
    console.log(
      `[resetStockLedger] Sẽ xoá ${fromMigration} dòng sổ kho và reset reserved trên ${reservedBooks} sách`
    );
    return { deleted: 0, reset: 0 };
  }

  // Raw driver: StockLedger blocks deletes by design (see the model's
  // append-only guard), and that guard is right for every path but this one.
  const deleted = await StockLedger.collection.deleteMany(migrationFilter);
  const reset = await Book.collection.updateMany(
    { reserved: { $gt: 0 } },
    { $set: { reserved: 0 } }
  );

  console.log(
    `[resetStockLedger] Đã xoá ${deleted.deletedCount} dòng sổ kho, reset reserved trên ${reset.modifiedCount} sách`
  );
  console.log(
    "[resetStockLedger] Chạy lại: npm run backfill:stock-ledger " +
      "(tự chạy backfill:reserved-stock trước)"
  );
  return { deleted: deleted.deletedCount, reset: reset.modifiedCount };
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  connectDB()
    .then(() => runOnce({ dryRun }))
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Stock ledger reset failed:", error.message);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { MIGRATION_REASONS, runOnce };
