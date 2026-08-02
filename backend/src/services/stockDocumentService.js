const mongoose = require("mongoose");
const Book = require("../models/Book");
const Counter = require("../models/Counter");
const StockLedger = require("../models/StockLedger");

// Shared helpers for the three stock documents (receipt, issue, count). They
// all follow the same shape: a DRAFT that touches nothing, a confirmation that
// writes the ledger inside a transaction, and a cancellation that either voids
// a draft or reverses a confirmed document.

class StockDocumentError extends Error {
  constructor(message, code = "STOCK_DOCUMENT_ERROR", statusCode = 400) {
    super(message);
    this.name = "StockDocumentError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function notFound(what) {
  return new StockDocumentError(`Không tìm thấy ${what}`, "NOT_FOUND", 404);
}

function badStatus(message) {
  return new StockDocumentError(message, "INVALID_STATUS", 409);
}

/**
 * Normalise and validate the line items posted from the admin UI.
 *
 * @param {Array} rawItems items from the request body
 * @param {object} options
 * @param {boolean} options.requireCost whether unitCost must be supplied
 * @returns {Promise<Array>} items with a title snapshot attached
 */
async function normalizeItems(rawItems, { requireCost = false } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new StockDocumentError("Phiếu phải có ít nhất một dòng", "EMPTY_ITEMS");
  }

  const seen = new Set();
  const parsed = rawItems.map((item, index) => {
    const line = index + 1;
    const bookId = String(item?.book || item?.bookId || "");
    if (!mongoose.isValidObjectId(bookId)) {
      throw new StockDocumentError(`Dòng ${line}: sách không hợp lệ`, "INVALID_BOOK");
    }
    if (seen.has(bookId)) {
      throw new StockDocumentError(
        `Dòng ${line}: sách bị trùng, hãy gộp thành một dòng`,
        "DUPLICATE_BOOK"
      );
    }
    seen.add(bookId);

    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new StockDocumentError(
        `Dòng ${line}: số lượng phải là số nguyên dương`,
        "INVALID_QUANTITY"
      );
    }

    const rawCost = item?.unitCost;
    const hasCost = rawCost !== undefined && rawCost !== null && rawCost !== "";
    if (requireCost && !hasCost) {
      throw new StockDocumentError(`Dòng ${line}: thiếu giá nhập`, "MISSING_COST");
    }
    const unitCost = hasCost ? Number(rawCost) : 0;
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new StockDocumentError(`Dòng ${line}: giá không hợp lệ`, "INVALID_COST");
    }

    return {
      book: new mongoose.Types.ObjectId(bookId),
      quantity,
      unitCost: Math.round(unitCost),
      note: String(item?.note || "").slice(0, 300),
    };
  });

  // Attach a title snapshot so the document still prints correctly after a
  // book is renamed or removed.
  const books = await Book.find({ _id: { $in: parsed.map((item) => item.book) } })
    .select("title costPrice")
    .lean();
  const byId = new Map(books.map((book) => [String(book._id), book]));
  for (const item of parsed) {
    const book = byId.get(String(item.book));
    if (!book) {
      throw new StockDocumentError(
        `Sách ${item.book} không tồn tại`,
        "BOOK_NOT_FOUND",
        404
      );
    }
    item.title = book.title;
  }
  return parsed;
}

/** Reserve the next document code, e.g. nextCode("stockReceipt", "PN"). */
function nextCode(key, prefix, session = null) {
  return Counter.nextCode(key, prefix, { session });
}

/**
 * Fill in each line's unitCost from the book's current moving-average cost.
 * Used at confirmation time for issues and stocktakes, where the value of the
 * goods is whatever they cost us, not something the admin types in.
 */
async function stampCurrentCosts(items, session) {
  const books = await Book.find({ _id: { $in: items.map((item) => item.book) } })
    .select("costPrice")
    .session(session)
    .lean();
  const costById = new Map(books.map((book) => [String(book._id), Number(book.costPrice) || 0]));
  for (const item of items) {
    item.unitCost = costById.get(String(item.book)) ?? 0;
  }
  return items;
}

/** Ledger rows already written for a document, used when reversing it. */
function ledgerEntriesFor(refType, refId, session = null) {
  return StockLedger.find({ refType, refId })
    .session(session || null)
    .lean();
}

function parseDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Shared list-filter builder for the document collections. */
function buildDocumentFilter(query = {}, { statuses = [] } = {}) {
  const filter = {};
  if (query.status && statuses.includes(query.status)) {
    filter.status = query.status;
  }
  const createdAt = {};
  const from = parseDateOrNull(query.from);
  const to = parseDateOrNull(query.to);
  if (from) createdAt.$gte = from;
  if (to) createdAt.$lte = to;
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;
  return filter;
}

module.exports = {
  StockDocumentError,
  badStatus,
  buildDocumentFilter,
  ledgerEntriesFor,
  nextCode,
  normalizeItems,
  notFound,
  parseDateOrNull,
  stampCurrentCosts,
};
