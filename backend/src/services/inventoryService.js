const mongoose = require("mongoose");
const Book = require("../models/Book");
const StockLedger = require("../models/StockLedger");
const config = require("../config");
const { notifyBackInStock } = require("./restockAlertService");
const { afterCommit } = require("../utils/transaction");

const { MOVEMENT_TYPES, INBOUND_TYPES } = StockLedger;

// Fallback low-stock threshold for books that have not set their own
// reorderPoint. Keeps behaviour compatible with the old hard-coded stock <= 5.
const DEFAULT_REORDER_POINT = Number(config.inventory?.defaultReorderPoint) || 5;

function optionsFor(session) {
  return session ? { session } : undefined;
}

// How each movement type shifts `Book.reserved`, relative to the quantity.
// Types absent from this map do not touch reservations at all.
const RESERVING_TYPES = Object.freeze({
  SALE_OUT: +1,
  RESERVE_IN: -1,
  SHIP_OUT: -1,
});

class InventoryError extends Error {
  constructor(message, code = "INVENTORY_ERROR", statusCode = 400) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InventoryError("Số lượng phải là số nguyên dương", "INVALID_QUANTITY");
  }
  return parsed;
}

/**
 * Recalculate moving-average cost for an inbound movement.
 *
 *   next = (unitsBefore * current + quantityIn * unitCost) / (unitsBefore + quantityIn)
 *
 * `unitsBefore` is every unit the shop owns (onHand), not just the sellable
 * ones - cost attaches to the goods, whether or not they are spoken for.
 *
 * A zero denominator is impossible because quantityIn is a positive integer.
 */
function movingAverageCost(unitsBefore, currentCost, quantityIn, unitCost) {
  const priorValue = Math.max(0, unitsBefore) * (Number(currentCost) || 0);
  const incomingValue = quantityIn * (Number(unitCost) || 0);
  const totalUnits = Math.max(0, unitsBefore) + quantityIn;
  if (totalUnits <= 0) return Number(unitCost) || 0;
  return Math.round((priorValue + incomingValue) / totalUnits);
}

/**
 * Undo a receipt's effect on the moving-average cost.
 *
 *   next = (unitsBefore * current - quantityOut * unitCost) / (unitsBefore - quantityOut)
 *
 * Take the units back out at the price they came in at, and let the remaining
 * inventory value decide the new average. Reversing a receipt immediately
 * restores the exact prior cost; if sales or other receipts happened in
 * between, this still books the honest remaining value rather than pretending
 * the earlier average can be recovered.
 *
 * Falls back to the current cost when nothing is left to value (the last units
 * are leaving) or when the arithmetic would go negative, which can only happen
 * if the reversal is larger than what the receipt actually added.
 */
function reverseMovingAverageCost(unitsBefore, currentCost, quantityOut, unitCost) {
  const remainingUnits = Math.max(0, unitsBefore) - quantityOut;
  if (remainingUnits <= 0) return Number(currentCost) || 0;
  const priorValue = Math.max(0, unitsBefore) * (Number(currentCost) || 0);
  const outgoingValue = quantityOut * (Number(unitCost) || 0);
  const remainingValue = priorValue - outgoingValue;
  if (remainingValue <= 0) return Number(currentCost) || 0;
  return Math.round(remainingValue / remainingUnits);
}

/**
 * The single entry point for every stock change in the system.
 *
 * Writes the ledger row and moves Book.stock together. Callers that already own
 * a transaction pass their session; callers that do not still get a safe stock
 * update because the decrement is a single conditional findOneAndUpdate.
 *
 * @returns {Promise<{book: object, ledger: object}>} updated book + ledger row.
 */
async function applyMovement(input, session = null) {
  const {
    bookId,
    type,
    quantity,
    unitCost = null,
    refType = null,
    refId = null,
    refCode = "",
    reason = "",
    performedBy = null,
    // Express app or request, used to push the socket notification.
    appOrReq = null,
  } = input;

  if (!MOVEMENT_TYPES.includes(type)) {
    throw new InventoryError(
      `Loại biến động không hợp lệ: ${type}`,
      "INVALID_MOVEMENT_TYPE"
    );
  }
  const absQuantity = toPositiveInt(quantity);
  const inbound = INBOUND_TYPES.has(type);
  // Dispatch is the one movement that does not touch `stock`: the copies left
  // the sellable figure back when the order was placed (SALE_OUT). Shipping
  // only converts them from "reserved on the shelf" to "gone", so it moves
  // `reserved` and `onHand` while `stock` stays put.
  const movesStock = type !== "SHIP_OUT";
  const signedQuantity = !movesStock ? 0 : inbound ? absQuantity : -absQuantity;

  if (type === "ADJUSTMENT" && !String(reason || "").trim()) {
    throw new InventoryError("Điều chỉnh tồn kho bắt buộc có lý do", "REASON_REQUIRED");
  }

  const before = await Book.findOne({ _id: bookId })
    .select("stock reserved costPrice title")
    .session(session || null)
    .lean();
  if (!before) {
    throw new InventoryError("Không tìm thấy sách", "BOOK_NOT_FOUND", 404);
  }

  const stockBefore = Number(before.stock) || 0;
  // Cost is a property of every unit the shop owns, not just the sellable
  // ones, so the moving average is weighted by onHand. Using `stock` alone
  // would drop the copies reserved for unshipped orders out of the valuation
  // and skew the average whenever an order is open.
  const ownedBefore = stockBefore + (Number(before.reserved) || 0);
  const currentCost = Number(before.costPrice) || 0;
  const resolvedUnitCost =
    unitCost === null || unitCost === undefined
      ? currentCost
      : Math.max(0, Number(unitCost) || 0);

  // Outbound movements must not drive stock negative. The guard lives in the
  // filter so two concurrent writers cannot both pass a read-then-write check.
  const filter = inbound || !movesStock
    ? { _id: bookId }
    : { _id: bookId, stock: { $gte: absQuantity } };

  // `reserved` tracks copies committed to an order but still on the shelf, so
  // it moves in the opposite direction to `stock` for the order lifecycle:
  //
  //   SALE_OUT    order placed      stock -q, reserved +q  (onHand unchanged)
  //   RESERVE_IN  order cancelled   stock +q, reserved -q  (onHand unchanged)
  //   SHIP_OUT    goods dispatched  stock  0, reserved -q  (onHand -q)
  //
  // Every other movement is a plain warehouse in/out and leaves reserved alone
  // - including CANCEL_IN, which voids a stock issue rather than an order and
  // so returns goods to the shelf without any reservation involved.
  const reservedDelta = RESERVING_TYPES[type] ?? 0;
  const update = { $inc: {} };
  if (signedQuantity !== 0) update.$inc.stock = signedQuantity;
  if (reservedDelta !== 0) {
    update.$inc.reserved = reservedDelta * absQuantity;
    if (reservedDelta < 0) {
      // Never let a release drive the counter below zero: without this a
      // double cancellation would leave reserved negative and inflate onHand.
      filter.reserved = { $gte: absQuantity };
    }
  }
  if (type === "PURCHASE_IN") {
    update.$set = {
      costPrice: movingAverageCost(
        ownedBefore,
        currentCost,
        absQuantity,
        resolvedUnitCost
      ),
      lastPurchasePrice: resolvedUnitCost,
    };
  } else if (type === "PURCHASE_REVERSAL") {
    update.$set = {
      costPrice: reverseMovingAverageCost(
        ownedBefore,
        currentCost,
        absQuantity,
        resolvedUnitCost
      ),
    };
  }

  const book = await Book.findOneAndUpdate(filter, update, {
    returnDocument: "after",
    ...optionsFor(session),
  });

  if (!book) {
    if (reservedDelta < 0) {
      // The stock guard cannot have failed here (releases only add stock), so
      // the reserved guard did: more is being released than was ever held.
      throw new InventoryError(
        `Không đủ hàng đang giữ cho "${before.title}" để giải phóng ${absQuantity}`,
        "INSUFFICIENT_RESERVED",
        409
      );
    }
    throw new InventoryError(
      `Không đủ tồn kho cho "${before.title}" (còn ${stockBefore}, cần ${absQuantity})`,
      "INSUFFICIENT_STOCK",
      409
    );
  }

  const [ledger] = await StockLedger.create(
    [
      {
        book: book._id,
        type,
        // SHIP_OUT leaves `stock` alone, but the ledger records the goods
        // actually leaving, so it books the outbound quantity rather than the
        // (zero) change to the sellable figure.
        quantity: movesStock ? signedQuantity : -absQuantity,
        stockBefore,
        stockAfter: book.stock,
        unitCost: resolvedUnitCost,
        refType,
        refId,
        refCode,
        reason,
        performedBy,
      },
    ],
    optionsFor(session)
  );

  if (inbound) {
    // Wishlist watchers care that the book is orderable again, whichever kind
    // of document put the stock back.
    const notify = () =>
      notifyBackInStock(
        { bookId: book._id, stockBefore, stockAfter: book.stock },
        appOrReq
      );
    if (!afterCommit(session, notify)) await notify();
  }

  return { book, ledger };
}

/**
 * Reconcile a book to a physical count, used by stocktake completion. Returns
 * null when nothing changes, so callers can skip writing a no-op row.
 *
 * `countedQty` is what the counter physically found on the shelf, which is the
 * `onHand` figure - sellable stock plus the copies reserved for orders that
 * have not shipped. Those reserved copies stay reserved; the count only moves
 * the sellable remainder, so completing a stocktake can never put goods already
 * promised to a customer back up for sale.
 *
 * `expectedOnHand` is the physical figure frozen on the count sheet. The update
 * is pinned to the sellable stock behind it, so if a sale or receipt moved
 * stock after the sheet was generated the counted number is stale and the whole
 * stocktake aborts rather than silently overwriting the newer value. Reading
 * current stock and pinning to *that* would make the guard a no-op, since it
 * could never disagree with itself.
 */
async function setStockTo(input, session = null) {
  const {
    bookId,
    countedQty,
    expectedOnHand,
    refType,
    refId,
    refCode,
    reason,
    performedBy,
    appOrReq = null,
  } = input;
  const target = Number(countedQty);
  if (!Number.isInteger(target) || target < 0) {
    throw new InventoryError("Số đếm phải là số nguyên không âm", "INVALID_QUANTITY");
  }
  const before = await Book.findOne({ _id: bookId })
    .select("stock reserved costPrice title")
    .session(session || null)
    .lean();
  if (!before) {
    throw new InventoryError("Không tìm thấy sách", "BOOK_NOT_FOUND", 404);
  }

  const stockBefore = Number(before.stock) || 0;
  const reservedNow = Number(before.reserved) || 0;
  const onHandBefore = stockBefore + reservedNow;
  const pinnedOnHand =
    expectedOnHand === undefined || expectedOnHand === null
      ? onHandBefore
      : Number(expectedOnHand);

  if (onHandBefore !== pinnedOnHand) {
    throw new InventoryError(
      `Tồn kho của "${before.title}" đã thay đổi từ ${pinnedOnHand} thành ${onHandBefore} trong lúc kiểm kho, vui lòng đếm lại`,
      "STOCK_CHANGED",
      409
    );
  }

  // The reserved copies are spoken for, so only the remainder is sellable.
  const targetStock = target - reservedNow;
  if (targetStock < 0) {
    throw new InventoryError(
      `"${before.title}" đếm được ${target} nhưng đang giữ ${reservedNow} cho đơn chưa giao, vui lòng kiểm tra lại số đếm`,
      "COUNT_BELOW_RESERVED",
      409
    );
  }
  if (targetStock === stockBefore) return null;

  const book = await Book.findOneAndUpdate(
    { _id: bookId, stock: stockBefore, reserved: reservedNow },
    { $set: { stock: targetStock, lastCountedAt: new Date() } },
    { returnDocument: "after", ...optionsFor(session) }
  );
  if (!book) {
    // Lost the race between the read above and this write.
    throw new InventoryError(
      `Tồn kho của "${before.title}" vừa thay đổi, vui lòng đếm lại`,
      "STOCK_CHANGED",
      409
    );
  }
  const difference = targetStock - stockBefore;

  const [ledger] = await StockLedger.create(
    [
      {
        book: book._id,
        type: "COUNT",
        quantity: difference,
        // The ledger tracks the sellable figure throughout, so a stocktake
        // books the change to `stock`, not the physical count it came from.
        stockBefore,
        stockAfter: targetStock,
        unitCost: Number(before.costPrice) || 0,
        refType,
        refId,
        refCode,
        reason,
        performedBy,
      },
    ],
    optionsFor(session)
  );

  if (difference > 0) {
    const notify = () =>
      notifyBackInStock(
        { bookId: book._id, stockBefore, stockAfter: targetStock },
        appOrReq
      );
    if (!afterCommit(session, notify)) await notify();
  }

  return { book, ledger };
}

/**
 * Apply several movements inside one transaction.
 *
 * MongoDB forbids parallel operations on a single session, so the loop is
 * deliberately sequential - the same constraint the order flow works under.
 */
async function applyBatch(movements, session = null) {
  const results = [];
  for (const movement of movements) {
    results.push(await applyMovement(movement, session));
  }
  return results;
}

/**
 * Reverse a previously applied movement, used when a confirmed document is
 * cancelled. Writes a mirrored entry rather than deleting history.
 */
function reverseMovement(ledgerEntry, { reason, performedBy = null }, session = null) {
  const wasInbound = ledgerEntry.quantity > 0;
  return applyMovement(
    {
      bookId: ledgerEntry.book,
      type: wasInbound ? "TRANSFER_OUT" : "ADJUSTMENT",
      quantity: Math.abs(ledgerEntry.quantity),
      unitCost: ledgerEntry.unitCost,
      refType: ledgerEntry.refType,
      refId: ledgerEntry.refId,
      refCode: ledgerEntry.refCode,
      reason,
      performedBy,
    },
    session
  );
}

function buildLedgerFilter(query = {}) {
  const filter = {};
  if (query.book && mongoose.isValidObjectId(query.book)) {
    filter.book = new mongoose.Types.ObjectId(String(query.book));
  }
  if (query.type && MOVEMENT_TYPES.includes(query.type)) {
    filter.type = query.type;
  }
  if (query.refType) filter.refType = query.refType;
  if (query.refId && mongoose.isValidObjectId(query.refId)) {
    filter.refId = new mongoose.Types.ObjectId(String(query.refId));
  }
  const createdAt = {};
  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
  }
  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime())) createdAt.$lte = to;
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;
  return filter;
}

async function getLedger(query = {}, { page = 1, limit = 20 } = {}) {
  const filter = buildLedgerFilter(query);
  const [entries, total] = await Promise.all([
    StockLedger.find(filter)
      .populate("book", "title imageUrl isbn")
      .populate("performedBy", "name email")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockLedger.countDocuments(filter),
  ]);
  return {
    entries,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

/** Units held plus the capital tied up in them, at cost and at retail. */
async function getStockValuation() {
  const [row] = await Book.aggregate([
    { $match: { status: "active" } },
    {
      // Valuation is about capital tied up in goods the shop still owns, so it
      // runs on onHand rather than the sellable figure: copies reserved for an
      // unshipped order are still sitting in the warehouse, still paid for, and
      // still part of the stock on the shelf.
      $addFields: {
        onHand: { $add: ["$stock", { $ifNull: ["$reserved", 0] }] },
      },
    },
    {
      $group: {
        _id: null,
        totalBooks: { $sum: 1 },
        totalUnits: { $sum: "$onHand" },
        sellableUnits: { $sum: "$stock" },
        reservedUnits: { $sum: { $ifNull: ["$reserved", 0] } },
        costValue: {
          $sum: { $multiply: ["$onHand", { $ifNull: ["$costPrice", 0] }] },
        },
        retailValue: { $sum: { $multiply: ["$onHand", "$price"] } },
        booksWithoutCost: {
          $sum: { $cond: [{ $gt: [{ $ifNull: ["$costPrice", 0] }, 0] }, 0, 1] },
        },
      },
    },
  ]);
  const valuation = {
    totalBooks: row?.totalBooks || 0,
    totalUnits: row?.totalUnits || 0,
    sellableUnits: row?.sellableUnits || 0,
    reservedUnits: row?.reservedUnits || 0,
    costValue: Math.round(row?.costValue || 0),
    retailValue: Math.round(row?.retailValue || 0),
    // Surfaces how much of the valuation is unreliable because cost is unset.
    booksWithoutCost: row?.booksWithoutCost || 0,
  };
  valuation.potentialProfit = valuation.retailValue - valuation.costValue;
  return valuation;
}

/**
 * Books at or below their reorder point. A reorderPoint of 0 means "use the
 * system default".
 */
function lowStockFilter(threshold = DEFAULT_REORDER_POINT) {
  return {
    status: "active",
    $or: [
      {
        reorderPoint: { $gt: 0 },
        $expr: { $lte: ["$stock", "$reorderPoint"] },
      },
      {
        $or: [{ reorderPoint: 0 }, { reorderPoint: null }],
        stock: { $lte: threshold },
      },
    ],
  };
}

function decorateLowStock(book) {
  const effectiveReorderPoint =
    book.reorderPoint > 0 ? book.reorderPoint : DEFAULT_REORDER_POINT;
  return {
    ...book,
    effectiveReorderPoint,
    suggestedQuantity:
      book.reorderQuantity > 0
        ? book.reorderQuantity
        : Math.max(1, effectiveReorderPoint * 2 - (Number(book.stock) || 0)),
  };
}

async function getLowStockBooks({ page = 1, limit = 20, includeOutOfStock = true } = {}) {
  const filter = lowStockFilter();
  if (!includeOutOfStock) filter.stock = { $gt: 0 };
  const [books, total] = await Promise.all([
    Book.find(filter)
      .select(
        "title author imageUrl isbn category stock price costPrice reorderPoint reorderQuantity defaultSupplier sold lastCountedAt"
      )
      .populate("defaultSupplier", "code name leadTimeDays")
      .sort({ stock: 1, sold: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Book.countDocuments(filter),
  ]);
  return {
    books: books.map(decorateLowStock),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

function countLowStock() {
  return Book.countDocuments(lowStockFilter());
}

/**
 * Aggregate movements over a period: what came in, what went out, and the cost
 * of goods sold.
 */
async function getMovementReport({ from, to } = {}) {
  const match = {};
  const createdAt = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) createdAt.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) createdAt.$lte = end;
  }
  if (Object.keys(createdAt).length) match.createdAt = createdAt;

  const rows = await StockLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$type",
        units: { $sum: { $abs: "$quantity" } },
        value: {
          $sum: { $multiply: [{ $abs: "$quantity" }, { $ifNull: ["$unitCost", 0] }] },
        },
        entries: { $sum: 1 },
      },
    },
  ]);

  const byType = Object.fromEntries(
    rows.map((row) => [
      row._id,
      { units: row.units, value: Math.round(row.value), entries: row.entries },
    ])
  );
  const sum = (types, key) =>
    types.reduce((total, type) => total + (byType[type]?.[key] || 0), 0);

  return {
    byType,
    totals: {
      inboundUnits: sum(
        ["PURCHASE_IN", "RETURN_IN", "CANCEL_IN", "RESERVE_IN"],
        "units"
      ),
      purchaseValue: sum(["PURCHASE_IN"], "value"),
      // SHIP_OUT is deliberately absent: the units already counted as SALE_OUT
      // when the order was placed, and counting the dispatch too would report
      // every sale twice.
      outboundUnits: sum(["SALE_OUT", "DAMAGE_OUT", "TRANSFER_OUT"], "units"),
      // Cost of goods sold: real sales only, valued at moving-average cost.
      cogs: sum(["SALE_OUT"], "value"),
      damageValue: sum(["DAMAGE_OUT"], "value"),
    },
  };
}

/**
 * Compare the ledger running total against Book.stock. A non-empty result means
 * something wrote to stock outside applyMovement, or a transaction was only
 * partially applied.
 */
function reconcileStock({ limit = 100 } = {}) {
  return StockLedger.aggregate([
    {
      // Two sums, because the ledger now tracks a two-field stock model:
      //
      //   ledgerTotal      every row -> reconciles the sellable figure `stock`
      //   physicalTotal    rows that move goods across the warehouse door
      //                    -> reconciles `onHand`
      //
      // SALE_OUT and RESERVE_IN only shuffle copies between `stock` and
      // `reserved`; the goods never move, so they are excluded from the
      // physical sum. SHIP_OUT is the mirror case: the goods leave, but
      // `stock` gave them up back at SALE_OUT, so it is excluded from the
      // sellable sum instead.
      $group: {
        _id: "$book",
        ledgerTotal: {
          $sum: {
            $cond: [{ $eq: ["$type", "SHIP_OUT"] }, 0, "$quantity"],
          },
        },
        physicalTotal: {
          $sum: {
            $cond: [
              { $in: ["$type", ["SALE_OUT", "RESERVE_IN"]] },
              0,
              "$quantity",
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: Book.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "book",
      },
    },
    { $unwind: "$book" },
    {
      $project: {
        title: "$book.title",
        stock: "$book.stock",
        reserved: { $ifNull: ["$book.reserved", 0] },
        onHand: { $add: ["$book.stock", { $ifNull: ["$book.reserved", 0] }] },
        ledgerTotal: 1,
        physicalTotal: 1,
        drift: { $subtract: ["$book.stock", "$ledgerTotal"] },
        physicalDrift: {
          $subtract: [
            { $add: ["$book.stock", { $ifNull: ["$book.reserved", 0] }] },
            "$physicalTotal",
          ],
        },
      },
    },
    { $match: { $or: [{ drift: { $ne: 0 } }, { physicalDrift: { $ne: 0 } }] } },
    { $sort: { drift: -1 } },
    { $limit: limit },
  ]);
}

module.exports = {
  DEFAULT_REORDER_POINT,
  InventoryError,
  applyBatch,
  applyMovement,
  buildLedgerFilter,
  countLowStock,
  decorateLowStock,
  getLedger,
  getLowStockBooks,
  getMovementReport,
  getStockValuation,
  lowStockFilter,
  movingAverageCost,
  reconcileStock,
  reverseMovingAverageCost,
  reverseMovement,
  setStockTo,
};
