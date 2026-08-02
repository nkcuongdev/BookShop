process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const Book = require("../src/models/Book");
const StockLedger = require("../src/models/StockLedger");
const StockReceipt = require("../src/models/StockReceipt");
const StockIssue = require("../src/models/StockIssue");
const StockCount = require("../src/models/StockCount");
const Supplier = require("../src/models/Supplier");
const User = require("../src/models/User");
const inventoryService = require("../src/services/inventoryService");
const receiptService = require("../src/services/stockReceiptService");
const issueService = require("../src/services/stockIssueService");
const countService = require("../src/services/stockCountService");

let replicaSet;
let adminId;
let supplierId;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([
    Book.syncIndexes(),
    StockLedger.syncIndexes(),
    StockReceipt.syncIndexes(),
    StockIssue.syncIndexes(),
    StockCount.syncIndexes(),
    Supplier.syncIndexes(),
  ]);
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
  const admin = await User.create({
    name: "Warehouse Admin",
    email: "warehouse@example.com",
    password: "secure-password",
    role: "admin",
    emailVerifiedAt: new Date(),
  });
  adminId = admin._id;
  const supplier = await Supplier.create({
    code: "NXBTRE",
    name: "NXB Tre",
    status: "active",
  });
  supplierId = supplier._id;
});

async function createBook(overrides = {}) {
  return Book.create({
    title: "Inventory Test Book",
    author: "Test Author",
    category: "testing",
    price: 100_000,
    stock: 0,
    status: "active",
    ...overrides,
  });
}

// ── applyMovement ────────────────────────────────────────────────────

test("applyMovement raises stock and records before/after on the ledger", async () => {
  const book = await createBook({ stock: 5 });

  const { book: updated, ledger } = await inventoryService.applyMovement({
    bookId: book._id,
    type: "PURCHASE_IN",
    quantity: 10,
    unitCost: 50_000,
    reason: "Nhap hang",
    performedBy: adminId,
  });

  assert.equal(updated.stock, 15);
  assert.equal(ledger.quantity, 10);
  assert.equal(ledger.stockBefore, 5);
  assert.equal(ledger.stockAfter, 15);
  assert.equal(ledger.type, "PURCHASE_IN");
});

test("applyMovement refuses to drive stock negative", async () => {
  const book = await createBook({ stock: 2 });

  await assert.rejects(
    () =>
      inventoryService.applyMovement({
        bookId: book._id,
        type: "SALE_OUT",
        quantity: 3,
      }),
    (error) => error.code === "INSUFFICIENT_STOCK"
  );

  const unchanged = await Book.findById(book._id).lean();
  assert.equal(unchanged.stock, 2);
  assert.equal(await StockLedger.countDocuments({ book: book._id }), 0);
});

test("a positive ADJUSTMENT adds stock rather than removing it", async () => {
  // Regression: ADJUSTMENT was missing from INBOUND_TYPES, so a correction
  // meant to raise stock tried to deduct it and failed on an empty book.
  const book = await createBook({ stock: 0 });

  const { book: updated, ledger } = await inventoryService.applyMovement({
    bookId: book._id,
    type: "ADJUSTMENT",
    quantity: 5,
    reason: "Bo sung ton thieu",
    performedBy: adminId,
  });

  assert.equal(updated.stock, 5);
  assert.equal(ledger.quantity, 5);
});

test("TRANSFER_OUT is the outbound half of a manual correction", async () => {
  const book = await createBook({ stock: 5 });

  const { book: updated, ledger } = await inventoryService.applyMovement({
    bookId: book._id,
    type: "TRANSFER_OUT",
    quantity: 2,
    reason: "Giam ton do nhap lieu sai",
    performedBy: adminId,
  });

  assert.equal(updated.stock, 3);
  assert.equal(ledger.quantity, -2);
});

test("every inbound movement type raises stock", async () => {
  // Guards the INBOUND_TYPES / applyMovement pairing as a whole, so adding a
  // movement type without classifying it shows up here.
  for (const type of ["PURCHASE_IN", "RETURN_IN", "CANCEL_IN", "ADJUSTMENT"]) {
    const book = await createBook({ title: `Inbound ${type}`, stock: 0 });
    const { book: updated } = await inventoryService.applyMovement({
      bookId: book._id,
      type,
      quantity: 3,
      reason: "Kiem tra chieu nhap",
    });
    assert.equal(updated.stock, 3, `${type} must add stock`);
  }
});

test("applyMovement requires a reason for manual adjustments", async () => {
  const book = await createBook({ stock: 1 });

  await assert.rejects(
    () =>
      inventoryService.applyMovement({
        bookId: book._id,
        type: "ADJUSTMENT",
        quantity: 1,
        reason: "   ",
      }),
    (error) => error.code === "REASON_REQUIRED"
  );
});

test("purchases move the average cost, sales leave it alone", async () => {
  const book = await createBook({ stock: 0, costPrice: 0 });

  // 10 @ 50k, then 10 @ 70k → average 60k.
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "PURCHASE_IN",
    quantity: 10,
    unitCost: 50_000,
  });
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "PURCHASE_IN",
    quantity: 10,
    unitCost: 70_000,
  });

  let current = await Book.findById(book._id).lean();
  assert.equal(current.costPrice, 60_000);
  assert.equal(current.lastPurchasePrice, 70_000);

  await inventoryService.applyMovement({
    bookId: book._id,
    type: "SALE_OUT",
    quantity: 5,
  });

  current = await Book.findById(book._id).lean();
  assert.equal(current.costPrice, 60_000, "a sale must not change average cost");
  assert.equal(current.stock, 15);
});

test("outbound movements are valued at the current average cost", async () => {
  const book = await createBook({ stock: 10, costPrice: 42_000 });

  const { ledger } = await inventoryService.applyMovement({
    bookId: book._id,
    type: "SALE_OUT",
    quantity: 2,
  });

  assert.equal(ledger.unitCost, 42_000);
  assert.equal(ledger.quantity, -2);
});

test("ledger rows cannot be updated or deleted", async () => {
  const book = await createBook({ stock: 5 });
  const { ledger } = await inventoryService.applyMovement({
    bookId: book._id,
    type: "SALE_OUT",
    quantity: 1,
  });

  await assert.rejects(() =>
    StockLedger.updateOne({ _id: ledger._id }, { $set: { quantity: 99 } })
  );
  await assert.rejects(() => StockLedger.deleteOne({ _id: ledger._id }));
});

// ── Goods receipts ───────────────────────────────────────────────────

test("a draft receipt does not touch stock until confirmed", async () => {
  const book = await createBook({ stock: 3 });

  const draft = await receiptService.createReceipt(
    {
      supplier: supplierId,
      items: [{ book: book._id, quantity: 7, unitCost: 40_000 }],
    },
    adminId
  );

  assert.equal(draft.status, "DRAFT");
  assert.equal((await Book.findById(book._id).lean()).stock, 3);

  await receiptService.confirmReceipt(draft._id, adminId);

  const stocked = await Book.findById(book._id).lean();
  assert.equal(stocked.stock, 10);
  // The 3 units already on hand carried a cost of 0, so the weighted average is
  // (3 * 0 + 7 * 40k) / 10 = 28k. lastPurchasePrice keeps the invoice figure.
  assert.equal(stocked.costPrice, 28_000);
  assert.equal(stocked.lastPurchasePrice, 40_000);
});

test("receipt totals are derived on the server, not trusted from input", async () => {
  const book = await createBook();

  const receipt = await receiptService.createReceipt(
    {
      supplier: supplierId,
      discount: 20_000,
      shippingFee: 30_000,
      subtotal: 999,
      totalAmount: 1,
      items: [{ book: book._id, quantity: 4, unitCost: 25_000 }],
    },
    adminId
  );

  assert.equal(receipt.subtotal, 100_000);
  assert.equal(receipt.totalAmount, 110_000);
});

test("a confirmed receipt cannot be edited or re-confirmed", async () => {
  const book = await createBook();
  const draft = await receiptService.createReceipt(
    {
      supplier: supplierId,
      items: [{ book: book._id, quantity: 2, unitCost: 10_000 }],
    },
    adminId
  );
  await receiptService.confirmReceipt(draft._id, adminId);

  await assert.rejects(
    () => receiptService.updateReceipt(draft._id, { note: "sua" }),
    (error) => error.code === "INVALID_STATUS"
  );
  await assert.rejects(
    () => receiptService.confirmReceipt(draft._id, adminId),
    (error) => error.code === "INVALID_STATUS"
  );
});

test("cancelling a confirmed receipt reverses the stock and needs a reason", async () => {
  const book = await createBook({ stock: 1 });
  const draft = await receiptService.createReceipt(
    {
      supplier: supplierId,
      items: [{ book: book._id, quantity: 9, unitCost: 10_000 }],
    },
    adminId
  );
  await receiptService.confirmReceipt(draft._id, adminId);
  assert.equal((await Book.findById(book._id).lean()).stock, 10);

  await assert.rejects(
    () => receiptService.cancelReceipt(draft._id, adminId, "  "),
    (error) => error.code === "REASON_REQUIRED"
  );

  const cancelled = await receiptService.cancelReceipt(
    draft._id,
    adminId,
    "Nhap nham so luong"
  );

  assert.equal(cancelled.status, "CANCELLED");
  assert.equal((await Book.findById(book._id).lean()).stock, 1);
  // History is preserved: the reversal is a new row, not a deletion.
  assert.equal(await StockLedger.countDocuments({ refId: draft._id }), 2);
});

test("a receipt line for an unknown book is rejected", async () => {
  await assert.rejects(
    () =>
      receiptService.createReceipt(
        {
          supplier: supplierId,
          items: [
            { book: new mongoose.Types.ObjectId(), quantity: 1, unitCost: 1 },
          ],
        },
        adminId
      ),
    (error) => error.code === "BOOK_NOT_FOUND"
  );
});

test("duplicate books on one receipt are rejected", async () => {
  const book = await createBook();

  await assert.rejects(
    () =>
      receiptService.createReceipt(
        {
          supplier: supplierId,
          items: [
            { book: book._id, quantity: 1, unitCost: 1_000 },
            { book: book._id, quantity: 2, unitCost: 1_000 },
          ],
        },
        adminId
      ),
    (error) => error.code === "DUPLICATE_BOOK"
  );
});

// ── Goods issues ─────────────────────────────────────────────────────

test("confirming a damage issue removes stock and books it as DAMAGE_OUT", async () => {
  const book = await createBook({ stock: 10, costPrice: 30_000 });

  const draft = await issueService.createIssue(
    {
      type: "DAMAGED",
      reason: "Sach bi am moc",
      items: [{ book: book._id, quantity: 4 }],
    },
    adminId
  );
  const confirmed = await issueService.confirmIssue(draft._id, adminId);

  assert.equal((await Book.findById(book._id).lean()).stock, 6);
  // Valued at the average cost held at confirmation time.
  assert.equal(confirmed.totalCost, 120_000);

  const entry = await StockLedger.findOne({ refId: draft._id }).lean();
  assert.equal(entry.type, "DAMAGE_OUT");
  assert.equal(entry.quantity, -4);
});

test("a gift issue is a transfer, not a write-off", async () => {
  const book = await createBook({ stock: 5, costPrice: 1_000 });
  const draft = await issueService.createIssue(
    {
      type: "GIFT",
      reason: "Tang khach VIP",
      items: [{ book: book._id, quantity: 1 }],
    },
    adminId
  );
  await issueService.confirmIssue(draft._id, adminId);

  const entry = await StockLedger.findOne({ refId: draft._id }).lean();
  assert.equal(entry.type, "TRANSFER_OUT");
});

test("an issue larger than stock is rejected and changes nothing", async () => {
  const book = await createBook({ stock: 2 });
  const draft = await issueService.createIssue(
    {
      type: "LOST",
      reason: "That lac",
      items: [{ book: book._id, quantity: 5 }],
    },
    adminId
  );

  await assert.rejects(
    () => issueService.confirmIssue(draft._id, adminId),
    (error) => error.code === "INSUFFICIENT_STOCK"
  );

  assert.equal((await Book.findById(book._id).lean()).stock, 2);
  assert.equal((await StockIssue.findById(draft._id).lean()).status, "DRAFT");
});

test("returning to a supplier requires that supplier", async () => {
  const book = await createBook({ stock: 5 });

  await assert.rejects(
    () =>
      issueService.createIssue(
        {
          type: "RETURN_SUPPLIER",
          reason: "Tra hang loi",
          items: [{ book: book._id, quantity: 1 }],
        },
        adminId
      ),
    (error) => error.code === "SUPPLIER_REQUIRED"
  );
});

test("cancelling a confirmed issue puts the stock back", async () => {
  const book = await createBook({ stock: 8, costPrice: 5_000 });
  const draft = await issueService.createIssue(
    {
      type: "DAMAGED",
      reason: "Rach bia",
      items: [{ book: book._id, quantity: 3 }],
    },
    adminId
  );
  await issueService.confirmIssue(draft._id, adminId);
  assert.equal((await Book.findById(book._id).lean()).stock, 5);

  await issueService.cancelIssue(draft._id, adminId, "Kiem tra lai thay con dung");

  assert.equal((await Book.findById(book._id).lean()).stock, 8);
});

// ── Stocktakes ───────────────────────────────────────────────────────

test("completing a stocktake forces stock to the counted figure", async () => {
  const shortBook = await createBook({ title: "Short", stock: 10, costPrice: 20_000 });
  const overBook = await createBook({ title: "Over", stock: 4, costPrice: 20_000 });

  const sheet = await countService.createCount({ scope: "ALL" }, adminId);
  assert.equal(sheet.items.length, 2);

  await countService.saveCountedQuantities(sheet._id, [
    { book: shortBook._id, countedQty: 7 },
    { book: overBook._id, countedQty: 6 },
  ]);

  const completed = await countService.completeCount(sheet._id, adminId);

  assert.equal(completed.status, "COMPLETED");
  assert.equal((await Book.findById(shortBook._id).lean()).stock, 7);
  assert.equal((await Book.findById(overBook._id).lean()).stock, 6);
  // −3 and +2 units, netting −1 unit at 20k.
  assert.equal(completed.totalDifference, -1);
  assert.equal(completed.totalValueDifference, -20_000);
  assert.equal(completed.diffLines, 2);
});

test("uncounted lines are left alone rather than treated as zero", async () => {
  const counted = await createBook({ title: "Counted", stock: 5 });
  const skipped = await createBook({ title: "Skipped", stock: 9 });

  const sheet = await countService.createCount({ scope: "ALL" }, adminId);
  await countService.saveCountedQuantities(sheet._id, [
    { book: counted._id, countedQty: 4 },
  ]);
  await countService.completeCount(sheet._id, adminId);

  assert.equal((await Book.findById(counted._id).lean()).stock, 4);
  assert.equal(
    (await Book.findById(skipped._id).lean()).stock,
    9,
    "a line nobody counted must not be zeroed"
  );
});

test("a stocktake with no counted line cannot be completed", async () => {
  await createBook({ stock: 3 });
  const sheet = await countService.createCount({ scope: "ALL" }, adminId);

  await assert.rejects(
    () => countService.completeCount(sheet._id, adminId),
    (error) => error.code === "NOTHING_COUNTED"
  );
});

test("a stocktake aborts if physical stock moved while counting", async () => {
  const book = await createBook({ stock: 10 });
  const sheet = await countService.createCount({ scope: "ALL" }, adminId);
  await countService.saveCountedQuantities(sheet._id, [
    { book: book._id, countedQty: 9 },
  ]);

  // A goods receipt lands after the sheet was generated: real copies arrived on
  // the shelf, so the counted figure is genuinely stale.
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "PURCHASE_IN",
    quantity: 2,
    unitCost: 1_000,
  });

  await assert.rejects(
    () => countService.completeCount(sheet._id, adminId),
    (error) => error.code === "STOCK_CHANGED"
  );

  assert.equal((await Book.findById(book._id).lean()).stock, 12);
  assert.equal((await StockCount.findById(sheet._id).lean()).status, "COUNTING");
});

test("a sale during a stocktake does not invalidate the count", async () => {
  const book = await createBook({ stock: 10 });
  const sheet = await countService.createCount({ scope: "ALL" }, adminId);
  await countService.saveCountedQuantities(sheet._id, [
    { book: book._id, countedQty: 10 },
  ]);

  // An order placed mid-count reserves two copies. They are still physically on
  // the shelf, so the counter's figure of 10 remains correct and the sheet must
  // still apply.
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "SALE_OUT",
    quantity: 2,
  });

  await countService.completeCount(sheet._id, adminId);

  // The two reserved copies stay reserved rather than going back up for sale.
  const updated = await Book.findById(book._id).lean();
  assert.equal(updated.stock, 8);
  assert.equal(updated.reserved, 2);
  assert.equal((await StockCount.findById(sheet._id).lean()).status, "COMPLETED");
});

test("a stocktake never puts reserved copies back up for sale", async () => {
  const book = await createBook({ stock: 10 });
  // Two copies are committed to an order that has not shipped: sellable drops
  // to 8, but all 10 are still on the shelf for the counter to find.
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "SALE_OUT",
    quantity: 2,
  });

  const sheet = await countService.createCount({ scope: "ALL" }, adminId);
  const line = sheet.items[0];
  assert.equal(line.systemQty, 8, "sheet records the sellable figure");
  assert.equal(line.reservedQty, 2, "sheet records what is held for orders");

  // The counter finds all ten copies and the count matches the shelf exactly.
  await countService.saveCountedQuantities(sheet._id, [
    { book: book._id, countedQty: 10 },
  ]);
  await countService.completeCount(sheet._id, adminId);

  const updated = await Book.findById(book._id).lean();
  assert.equal(updated.stock, 8, "sellable stock must not absorb reserved copies");
  assert.equal(updated.reserved, 2);
});

test("a stocktake rejects a count lower than the copies held for orders", async () => {
  const book = await createBook({ stock: 10 });
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "SALE_OUT",
    quantity: 6,
  });

  const sheet = await countService.createCount({ scope: "ALL" }, adminId);
  await countService.saveCountedQuantities(sheet._id, [
    { book: book._id, countedQty: 3 },
  ]);

  await assert.rejects(
    () => countService.completeCount(sheet._id, adminId),
    (error) => error.code === "COUNT_BELOW_RESERVED"
  );
});

test("a category stocktake only sheets that category", async () => {
  await createBook({ title: "In scope", category: "van-hoc", stock: 1 });
  await createBook({ title: "Out of scope", category: "kinh-te", stock: 1 });

  const sheet = await countService.createCount(
    { scope: "CATEGORY", scopeValue: "van-hoc" },
    adminId
  );

  assert.equal(sheet.items.length, 1);
  assert.equal(sheet.items[0].title, "In scope");
});

// ── Reporting ────────────────────────────────────────────────────────

test("low stock uses the per-book reorder point, then the system default", async () => {
  await createBook({ title: "Custom threshold", stock: 8, reorderPoint: 10 });
  await createBook({ title: "Above custom", stock: 12, reorderPoint: 10 });
  await createBook({ title: "Default threshold", stock: 4, reorderPoint: 0 });
  await createBook({ title: "Healthy", stock: 50, reorderPoint: 0 });

  const { books } = await inventoryService.getLowStockBooks({ limit: 50 });
  const titles = books.map((book) => book.title).sort();

  assert.deepEqual(titles, ["Custom threshold", "Default threshold"]);
});

test("valuation reports cost, retail and how much cost data is missing", async () => {
  await createBook({ stock: 10, price: 100_000, costPrice: 60_000 });
  await createBook({ stock: 5, price: 200_000, costPrice: 0 });

  const valuation = await inventoryService.getStockValuation();

  assert.equal(valuation.totalUnits, 15);
  assert.equal(valuation.costValue, 600_000);
  assert.equal(valuation.retailValue, 2_000_000);
  assert.equal(valuation.booksWithoutCost, 1);
});

test("the movement report separates COGS from write-offs", async () => {
  const book = await createBook({ stock: 20, costPrice: 10_000 });
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "SALE_OUT",
    quantity: 3,
  });
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "DAMAGE_OUT",
    quantity: 2,
  });

  const report = await inventoryService.getMovementReport({});

  assert.equal(report.totals.cogs, 30_000);
  assert.equal(report.totals.damageValue, 20_000);
  assert.equal(report.totals.outboundUnits, 5);
});

test("reconcile stays quiet when stock matches the ledger and flags it when it does not", async () => {
  const book = await createBook({ stock: 0 });
  await inventoryService.applyMovement({
    bookId: book._id,
    type: "PURCHASE_IN",
    quantity: 6,
    unitCost: 1_000,
  });

  assert.deepEqual(await inventoryService.reconcileStock(), []);

  // Simulate a write that bypassed the service.
  await Book.updateOne({ _id: book._id }, { $inc: { stock: 4 } });

  const drifts = await inventoryService.reconcileStock();
  assert.equal(drifts.length, 1);
  assert.equal(drifts[0].drift, 4);
  assert.equal(drifts[0].ledgerTotal, 6);
  assert.equal(drifts[0].stock, 10);
});
