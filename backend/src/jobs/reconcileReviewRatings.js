const mongoose = require("mongoose");
// db.js exports connectDB as the module itself, not as a named property.
const connectDB = require("../config/db");
const Book = require("../models/Book");

async function runOnce() {
  const modifiedCount = await Book.reconcileRatingAggregates();
  console.log(`Reconciled rating aggregates for ${modifiedCount} books`);
  return modifiedCount;
}

if (require.main === module) {
  connectDB()
    .then(runOnce)
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error("Rating reconciliation failed:", error);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { runOnce };
