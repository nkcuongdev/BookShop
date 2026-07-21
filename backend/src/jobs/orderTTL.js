const Book = require("../models/Book");
const orderService = require("../services/orderService");
const mongoose = require("mongoose");

const POLL_INTERVAL_MS = 60 * 1000;

let timer = null;
let tickRunning = false;

async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    if (mongoose.connection.readyState !== 1) return;
    const cancelled = await orderService.expirePendingOrders();
    if (cancelled.length > 0) {
      console.log(
        `[orderTTL] Auto-cancelled ${cancelled.length} expired PENDING order(s): ${cancelled.join(", ")}`
      );
    }
    const retriedRefunds = await orderService.reconcilePendingRefunds();
    if (retriedRefunds > 0) {
      console.log(
        `[orderTTL] Retried ${retriedRefunds} pending refund request(s)`
      );
    }
  } catch (err) {
    console.error("[orderTTL] Tick error:", err);
  } finally {
    tickRunning = false;
  }
}

/**
 * Migration một lần: nếu DB còn field `reservedStock` (từ mô hình cũ),
 * gộp nó vào `stock` và xóa field này đi. Giải quyết tình trạng "còn hàng
 * nhưng báo hết" do reservedStock bị kẹt.
 */
async function migrateReservedStock() {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const col = Book.collection;
    // A pipeline update is atomic per document and idempotent: concurrent app
    // instances cannot add the same reservedStock value more than once.
    const res = await col.updateMany(
      { reservedStock: { $exists: true } },
      [
        {
          $set: {
            stock: {
              $add: [
                { $ifNull: ["$stock", 0] },
                { $ifNull: ["$reservedStock", 0] },
              ],
            },
          },
        },
        { $unset: "reservedStock" },
      ]
    );
    if (res.modifiedCount > 0) {
      console.log(
        `[migrate] Đã gộp và xóa reservedStock khỏi ${res.modifiedCount} sách`
      );
    }
  } catch (err) {
    console.error("[migrate] reservedStock migration error:", err);
  }
}

async function runOnce() {
  await migrateReservedStock();
  const releasedVouchers = await orderService.reconcileVoucherReleases();
  if (releasedVouchers > 0) {
    console.log(`[migrate] Released ${releasedVouchers} stale voucher reservation(s)`);
  }
  await tick();
}

function start() {
  if (timer) return;
  setTimeout(runOnce, 10_000);
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

module.exports = { start, stop, migrateReservedStock, runOnce };
