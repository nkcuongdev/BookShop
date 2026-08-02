process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const Book = require("../src/models/Book");
const StockLedger = require("../src/models/StockLedger");
const {
  decrementStock,
  incrementStock,
  restoreItems,
} = require("../src/services/orderInventoryService");

// The order flow was refactored to route every stock change through the
// inventory ledger. These tests pin the adapter's contract: the old boolean
// return value survives, and each order event lands as the right movement type.

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([Book.syncIndexes(), StockLedger.syncIndexes()]);
});

after(async () => {
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
});

async function createBook(overrides = {}) {
  return Book.create({
    title: "Order Ledger Book",
    author: "Test Author",
    category: "testing",
    price: 100_000,
    stock: 10,
    status: "active",
    ...overrides,
  });
}

test("decrementStock returns true and books a SALE_OUT row", async () => {
  const book = await createBook({ stock: 10 });
  const orderId = new mongoose.Types.ObjectId();

  const ok = await decrementStock(book._id, 3, null, {
    orderId,
    orderCode: "DH000001",
    reason: "Ban hang",
  });

  assert.equal(ok, true);
  assert.equal((await Book.findById(book._id).lean()).stock, 7);

  const entry = await StockLedger.findOne({ book: book._id }).lean();
  assert.equal(entry.type, "SALE_OUT");
  assert.equal(entry.quantity, -3);
  assert.equal(entry.refType, "Order");
  assert.equal(entry.refCode, "DH000001");
  assert.equal(String(entry.refId), String(orderId));
});

test("decrementStock returns false instead of throwing when stock runs out", async () => {
  const book = await createBook({ stock: 1 });

  const ok = await decrementStock(book._id, 2);

  assert.equal(ok, false, "the order flow relies on a boolean to roll back");
  assert.equal((await Book.findById(book._id).lean()).stock, 1);
  assert.equal(await StockLedger.countDocuments({}), 0);
});

test("decrementStock returns false for a book that no longer exists", async () => {
  assert.equal(await decrementStock(new mongoose.Types.ObjectId(), 1), false);
});

test("restoreItems books a cancellation as RESERVE_IN by default", async () => {
  const first = await createBook({ title: "First", stock: 5 });
  const second = await createBook({ title: "Second", stock: 5 });
  const orderId = new mongoose.Types.ObjectId();

  // Cancelling releases a reservation, so one has to exist first: placing the
  // order moves the copies out of `stock` and into `reserved`.
  await decrementStock(first._id, 2, null, { orderId, orderCode: "DH000002" });
  await decrementStock(second._id, 3, null, { orderId, orderCode: "DH000002" });
  assert.equal((await Book.findById(first._id).lean()).stock, 3);
  assert.equal((await Book.findById(first._id).lean()).reserved, 2);

  await restoreItems(
    [
      { book: first._id, quantity: 2 },
      { book: second._id, quantity: 3 },
    ],
    null,
    { orderId, orderCode: "DH000002", reason: "Huy don" }
  );

  // Back to the opening figures, with nothing left held for the order.
  const restoredFirst = await Book.findById(first._id).lean();
  const restoredSecond = await Book.findById(second._id).lean();
  assert.equal(restoredFirst.stock, 5);
  assert.equal(restoredFirst.reserved, 0);
  assert.equal(restoredSecond.stock, 5);
  assert.equal(restoredSecond.reserved, 0);

  const entries = await StockLedger.find({ refId: orderId, type: "RESERVE_IN" }).lean();
  assert.equal(entries.length, 2);
});

test("restoreItems books a delivered refund as RETURN_IN", async () => {
  const book = await createBook({ stock: 4 });

  await restoreItems(
    [{ book: book._id, quantity: 2 }],
    null,
    { orderCode: "DH000003", reason: "Hoan tien" },
    "RETURN_IN"
  );

  const entry = await StockLedger.findOne({ book: book._id }).lean();
  assert.equal(entry.type, "RETURN_IN");
  assert.equal(entry.quantity, 2);
  assert.equal((await Book.findById(book._id).lean()).stock, 6);
});

test("a sale followed by a cancellation nets back to the starting stock", async () => {
  const book = await createBook({ stock: 10 });

  await decrementStock(book._id, 4, null, { reason: "Ban hang" });
  await incrementStock(book._id, 4, null, { reason: "Huy don" });

  assert.equal((await Book.findById(book._id).lean()).stock, 10);

  const [total] = await StockLedger.aggregate([
    { $match: { book: book._id } },
    { $group: { _id: null, sum: { $sum: "$quantity" } } },
  ]);
  assert.equal(total.sum, 0, "the ledger must net to zero, not lose the history");
  assert.equal(await StockLedger.countDocuments({ book: book._id }), 2);
});
