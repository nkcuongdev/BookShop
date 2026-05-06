const Book = require("../models/Book");
const orderService = require("../services/orderService");

const POLL_INTERVAL_MS = 60 * 1000;

let timer = null;

async function tick() {
  try {
    const cancelled = await orderService.expirePendingOrders();
    if (cancelled.length > 0) {
      console.log(
        `[orderTTL] Auto-cancelled ${cancelled.length} expired PENDING order(s): ${cancelled.join(", ")}`
      );
    }
  } catch (err) {
    console.error("[orderTTL] Tick error:", err);
  }
}

/**
 * Migration một lần: nếu DB còn field `reservedStock` (từ mô hình cũ),
 * gộp nó vào `stock` và xóa field này đi. Giải quyết tình trạng "còn hàng
 * nhưng báo hết" do reservedStock bị kẹt.
 */
async function migrateReservedStock() {
  try {
    const col = Book.collection;
    const stuck = await col
      .find({ reservedStock: { $exists: true, $gt: 0 } })
      .toArray();

    if (stuck.length > 0) {
      for (const doc of stuck) {
        await col.updateOne(
          { _id: doc._id },
          { $inc: { stock: doc.reservedStock } }
        );
      }
      console.log(
        `[migrate] Gộp reservedStock vào stock cho ${stuck.length} sách`
      );
    }

    const res = await col.updateMany(
      { reservedStock: { $exists: true } },
      { $unset: { reservedStock: "" } }
    );
    if (res.modifiedCount > 0) {
      console.log(
        `[migrate] Đã xóa field reservedStock khỏi ${res.modifiedCount} sách`
      );
    }
  } catch (err) {
    console.error("[migrate] reservedStock migration error:", err);
  }
}

async function bootstrap() {
  await migrateReservedStock();
  await tick();
}

function start() {
  if (timer) return;
  setTimeout(bootstrap, 10_000);
  timer = setInterval(tick, POLL_INTERVAL_MS);
  console.log(
    `Order TTL worker started (check every ${POLL_INTERVAL_MS / 1000}s)`
  );
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop };
