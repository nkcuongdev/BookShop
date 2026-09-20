require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const orderTTL = require("./orderTTL");
const assetCleanup = require("./assetCleanup");
const shippingSimulation = require("./shippingSimulation");
const promotionAlerts = require("./promotionAlerts");
const orderCancellation = require("./orderCancellation");
const returnRefund = require("./returnRefund");
const supportTicketSweep = require("./supportTicketSweep");
const lowStockAlerts = require("./lowStockAlerts");
const reconcileStock = require("./reconcileStock");
const cartReminders = require("./cartReminders");

async function runMaintenance() {
  await connectDB();
  await orderTTL.runOnce();
  await assetCleanup.tick();
  await shippingSimulation.tick();
  await promotionAlerts.tick();
  await orderCancellation.tick();
  await returnRefund.tick();
  await supportTicketSweep.tick();
  await lowStockAlerts.runOnce();
  await reconcileStock.runOnce({ notify: true });
  await cartReminders.tick();
}

if (require.main === module) {
  runMaintenance()
    .then(() => {
      console.log("Maintenance run completed");
    })
    .catch((error) => {
      console.error("Maintenance run failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => null);
    });
}

module.exports = { runMaintenance };
