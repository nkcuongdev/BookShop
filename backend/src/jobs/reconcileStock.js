const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const inventoryService = require("../services/inventoryService");
const notificationService = require("../services/notificationService");

const INTERVAL_MS = 24 * 60 * 60_000;
const MAX_REPORTED = 20;

let timer = null;
let running = false;
let app = null;

/**
 * Cross-check both halves of the stock model against the ledger: `stock` (what
 * is sellable) and `onHand` (what should physically be on the shelf). Either
 * can drift independently, so both are reported.
 *
 * A drift means something wrote to stock outside inventoryService, or a
 * transaction applied only partially. The job reports rather than repairs:
 * silently "fixing" a discrepancy would destroy the evidence needed to find the
 * cause, so an admin decides whether to post a correcting adjustment.
 */
async function runOnce({ notify = false } = {}) {
  if (mongoose.connection.readyState !== 1) return [];
  const drifts = await inventoryService.reconcileStock({ limit: 500 });

  if (!drifts.length) {
    console.log("[reconcileStock] Stock matches the ledger for every book");
    return drifts;
  }

  console.warn(
    `[reconcileStock] ${drifts.length} book(s) drifted from the ledger:`,
    drifts.slice(0, MAX_REPORTED).map((row) => ({
      title: row.title,
      stock: row.stock,
      reserved: row.reserved,
      onHand: row.onHand,
      ledgerTotal: row.ledgerTotal,
      physicalTotal: row.physicalTotal,
      drift: row.drift,
      physicalDrift: row.physicalDrift,
    }))
  );

  if (notify) {
    const signed = (value) => `${value > 0 ? "+" : ""}${value}`;
    const preview = drifts
      .slice(0, 5)
      .map((row) => {
        const parts = [];
        if (row.drift) parts.push(`bán được ${signed(row.drift)}`);
        if (row.physicalDrift) parts.push(`tồn thực tế ${signed(row.physicalDrift)}`);
        return `${row.title} (lệch ${parts.join(", ")})`;
      })
      .join(", ");
    await notificationService
      .notifyAdmins(
        {
          type: "stock",
          title: "Phát hiện lệch tồn kho",
          message: `${drifts.length} sách có tồn kho không khớp sổ cái: ${preview}${
            drifts.length > 5 ? "..." : ""
          }`,
          link: "/admin/inventory/ledger",
          metadata: { driftCount: drifts.length },
        },
        app
      )
      .catch(() => null);
  }

  return drifts;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await runOnce({ notify: true });
  } catch (error) {
    console.error("[reconcileStock] Tick error:", error.message);
  } finally {
    running = false;
  }
}

function start(expressApp) {
  if (timer) return;
  app = expressApp;
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  app = null;
}

if (require.main === module) {
  connectDB()
    .then(() => runOnce())
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Stock reconciliation failed:", error);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { INTERVAL_MS, runOnce, start, stop, tick };
