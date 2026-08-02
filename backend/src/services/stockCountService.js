const mongoose = require("mongoose");
const Book = require("../models/Book");
const StockCount = require("../models/StockCount");
const inventoryService = require("./inventoryService");
const { runInTransaction } = require("../utils/transaction");
const {
  StockDocumentError,
  badStatus,
  buildDocumentFilter,
  nextCode,
  notFound,
} = require("./stockDocumentService");

const REF_TYPE = "StockCount";
const MAX_SHEET_LINES = 5000;
const POPULATE = [
  { path: "createdBy", select: "name email" },
  { path: "completedBy", select: "name email" },
  { path: "items.book", select: "title imageUrl isbn category stock" },
];

/**
 * Build the count sheet by snapshotting current stock for every book in scope.
 * The snapshot is what the counter compares against, so it is frozen here
 * rather than read again at completion time.
 */
async function buildSheet(scope, scopeValue, bookIds = []) {
  const filter = { status: "active" };
  if (scope === "CATEGORY") {
    if (!String(scopeValue || "").trim()) {
      throw new StockDocumentError("Chọn danh mục để kiểm kho", "SCOPE_REQUIRED");
    }
    filter.category = String(scopeValue).trim();
  } else if (scope === "CUSTOM") {
    const ids = (Array.isArray(bookIds) ? bookIds : []).filter((id) =>
      mongoose.isValidObjectId(String(id))
    );
    if (!ids.length) {
      throw new StockDocumentError("Chọn ít nhất một sách để kiểm kho", "SCOPE_REQUIRED");
    }
    filter._id = { $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))) };
  }

  const books = await Book.find(filter)
    .select("title stock reserved costPrice")
    .sort({ title: 1, _id: 1 })
    .limit(MAX_SHEET_LINES + 1)
    .lean();

  if (!books.length) {
    throw new StockDocumentError("Không có sách nào trong phạm vi kiểm kho", "EMPTY_SCOPE");
  }
  if (books.length > MAX_SHEET_LINES) {
    throw new StockDocumentError(
      `Phạm vi quá lớn (trên ${MAX_SHEET_LINES} sách), hãy kiểm theo danh mục`,
      "SCOPE_TOO_LARGE"
    );
  }

  return books.map((book) => ({
    book: book._id,
    title: book.title,
    systemQty: Number(book.stock) || 0,
    reservedQty: Number(book.reserved) || 0,
    countedQty: null,
    difference: 0,
    unitCost: Number(book.costPrice) || 0,
    note: "",
  }));
}

async function listCounts(query = {}, { page = 1, limit = 20 } = {}) {
  const filter = buildDocumentFilter(query, { statuses: StockCount.COUNT_STATUS });
  if (query.search) {
    filter.code = new RegExp(`^${String(query.search).trim().toUpperCase()}`);
  }
  const [counts, total] = await Promise.all([
    StockCount.find(filter)
      .select("-items")
      .populate("createdBy", "name")
      .populate("completedBy", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockCount.countDocuments(filter),
  ]);
  return {
    counts,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function getCount(id) {
  if (!mongoose.isValidObjectId(String(id))) throw notFound("phiếu kiểm kho");
  const count = await StockCount.findById(id).populate(POPULATE).lean();
  if (!count) throw notFound("phiếu kiểm kho");
  return count;
}

async function createCount(body = {}, userId) {
  const scope = StockCount.COUNT_SCOPES.includes(body.scope) ? body.scope : "ALL";
  const scopeValue = scope === "CATEGORY" ? String(body.scopeValue || "").trim() : "";
  const items = await buildSheet(scope, scopeValue, body.bookIds);

  const code = await nextCode("stockCount", "KK");
  const count = await StockCount.create({
    code,
    scope,
    scopeValue,
    items,
    status: "COUNTING",
    startedAt: new Date(),
    note: String(body.note || "").slice(0, 1000),
    createdBy: userId,
  });
  return getCount(count._id);
}

/**
 * Record counted quantities. Accepts a partial list so the sheet can be filled
 * in over several sessions; a null countedQty clears a line back to uncounted.
 */
async function saveCountedQuantities(id, rawItems) {
  const count = await StockCount.findById(id);
  if (!count) throw notFound("phiếu kiểm kho");
  if (!["DRAFT", "COUNTING"].includes(count.status)) {
    throw badStatus("Phiếu kiểm kho đã kết thúc, không thể nhập số đếm");
  }
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw new StockDocumentError("Không có dòng nào để cập nhật", "EMPTY_ITEMS");
  }

  const byBook = new Map(count.items.map((item) => [String(item.book), item]));
  for (const raw of rawItems) {
    const key = String(raw?.book || raw?.bookId || "");
    const item = byBook.get(key);
    if (!item) {
      throw new StockDocumentError(
        `Sách ${key} không thuộc phiếu kiểm kho này`,
        "BOOK_NOT_IN_SHEET"
      );
    }
    const rawQuantity = raw?.countedQty;
    if (rawQuantity === null || rawQuantity === "" || rawQuantity === undefined) {
      item.countedQty = null;
    } else {
      const counted = Number(rawQuantity);
      if (!Number.isInteger(counted) || counted < 0) {
        throw new StockDocumentError(
          `Số đếm của "${item.title}" phải là số nguyên không âm`,
          "INVALID_QUANTITY"
        );
      }
      item.countedQty = counted;
    }
    if (raw?.note !== undefined) item.note = String(raw.note).slice(0, 300);
  }

  count.status = "COUNTING";
  if (!count.startedAt) count.startedAt = new Date();
  count.markModified("items");
  try {
    await count.save();
  } catch (error) {
    if (error?.name === "VersionError") {
      throw badStatus("Phiếu kiểm kho đã thay đổi hoặc kết thúc trong lúc cập nhật");
    }
    throw error;
  }
  return getCount(count._id);
}

/**
 * Re-freeze the sheet's baseline against current stock, so a count interrupted
 * by real warehouse movement can be finished instead of thrown away.
 *
 * `systemQty`/`reservedQty` are snapshotted when the sheet is created. If a
 * receipt or an issue moves the goods mid-count, completion aborts with
 * STOCK_CHANGED and the line has to be recounted - but recounting alone never
 * helped, because saving a count only touches countedQty and the stale baseline
 * kept failing the same check. Without this the only way out was to cancel the
 * sheet and start over.
 *
 * Counted figures are deliberately kept: the counter's numbers are evidence
 * about the shelf, and the refreshed baseline is what they are compared
 * against. Lines whose baseline actually moved are reported back so the sheet
 * can flag them for a recount.
 */
async function refreshBaseline(id) {
  const count = await StockCount.findById(id);
  if (!count) throw notFound("phiếu kiểm kho");
  if (!["DRAFT", "COUNTING"].includes(count.status)) {
    throw badStatus("Phiếu kiểm kho đã kết thúc");
  }

  const books = await Book.find({ _id: { $in: count.items.map((item) => item.book) } })
    .select("stock reserved")
    .lean();
  const current = new Map(books.map((book) => [String(book._id), book]));

  const changed = [];
  for (const item of count.items) {
    const book = current.get(String(item.book));
    if (!book) continue;
    const stock = Number(book.stock) || 0;
    const reserved = Number(book.reserved) || 0;
    const wasOnHand = item.systemQty + (Number(item.reservedQty) || 0);
    if (stock === item.systemQty && reserved === (Number(item.reservedQty) || 0)) {
      continue;
    }
    changed.push({
      book: item.book,
      title: item.title,
      previousOnHand: wasOnHand,
      currentOnHand: stock + reserved,
    });
    item.systemQty = stock;
    item.reservedQty = reserved;
  }

  count.status = "COUNTING";
  if (!count.startedAt) count.startedAt = new Date();
  count.markModified("items");
  try {
    await count.save();
  } catch (error) {
    if (error?.name === "VersionError") {
      throw badStatus("Phiếu kiểm kho đã thay đổi hoặc kết thúc trong lúc làm mới số hệ thống");
    }
    throw error;
  }
  return { count: await getCount(count._id), changed };
}

/**
 * Complete the stocktake: force stock to the counted figure for every line that
 * differs and write a COUNT ledger row for each.
 *
 * Lines left uncounted are ignored rather than treated as zero — that
 * distinction is why countedQty defaults to null.
 *
 * The counter reports physical copies on the shelf, which is Book.onHand
 * (sellable stock plus copies reserved for unshipped orders). setStockTo keeps
 * the reserved half untouched and moves only the sellable remainder, so
 * completing a count can never put goods already promised to a customer back up
 * for sale.
 *
 * setStockTo pins the expected value, so if a sale lands mid-count the whole
 * transaction aborts with STOCK_CHANGED and the admin recounts that line.
 */
async function completeCount(id, userId) {
  await runInTransaction(async (session) => {
    const count = await StockCount.findById(id).session(session);
    if (!count) throw notFound("phiếu kiểm kho");
    if (!["DRAFT", "COUNTING"].includes(count.status)) {
      throw badStatus("Phiếu kiểm kho đã kết thúc");
    }

    const counted = count.items.filter(
      (item) => item.countedQty !== null && item.countedQty !== undefined
    );
    if (!counted.length) {
      throw new StockDocumentError(
        "Chưa nhập số đếm cho dòng nào",
        "NOTHING_COUNTED"
      );
    }

    for (const item of counted) {
      // countedQty is the physical figure; setStockTo subtracts whatever is
      // reserved *now* (re-read there, not taken from the sheet's snapshot) and
      // writes only the sellable remainder.
      await inventoryService.setStockTo(
        {
          bookId: item.book,
          countedQty: item.countedQty,
          // Physical stock frozen when the sheet was generated; the movement
          // aborts if it has since drifted.
          expectedOnHand: item.systemQty + (Number(item.reservedQty) || 0),
          refType: REF_TYPE,
          refId: count._id,
          refCode: count.code,
          reason: `Kiểm kho ${count.code}${item.note ? `: ${item.note}` : ""}`,
          performedBy: userId,
        },
        session
      );
    }

    count.status = "COMPLETED";
    count.completedAt = new Date();
    count.completedBy = userId;
    count.markModified("items");
    await count.save({ session });
  });
  return getCount(id);
}

async function cancelCount(id, reason = "") {
  const count = await StockCount.findById(id);
  if (!count) throw notFound("phiếu kiểm kho");
  if (count.status === "COMPLETED") {
    throw badStatus("Phiếu kiểm kho đã hoàn tất, không thể huỷ");
  }
  if (count.status === "CANCELLED") {
    throw badStatus("Phiếu kiểm kho đã bị huỷ trước đó");
  }
  count.status = "CANCELLED";
  count.cancelledAt = new Date();
  count.cancelReason = String(reason || "").trim().slice(0, 500);
  await count.save();
  return getCount(count._id);
}

/** CSV export of the count sheet, for printing and counting on paper. */
function buildCountCsv(count) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // "Ton he thong" is the sellable figure and "Dang giu cho don" the copies
  // already committed to unshipped orders; the counter compares the shelf
  // against their sum, printed as "Ton kho du kien".
  const rows = [
    [
      "Ma sach",
      "Ten sach",
      "Ton he thong",
      "Dang giu cho don",
      "Ton kho du kien",
      "Ton thuc te",
      "Chenh lech",
      "Ghi chu",
    ],
  ];
  for (const item of count.items) {
    const reservedQty = Number(item.reservedQty) || 0;
    rows.push([
      item.book?._id || item.book,
      item.title,
      item.systemQty,
      reservedQty,
      item.systemQty + reservedQty,
      item.countedQty ?? "",
      item.countedQty === null || item.countedQty === undefined ? "" : item.difference,
      item.note || "",
    ]);
  }
  // A BOM keeps Excel from mangling the Vietnamese column headers.
  const bom = "\uFEFF";
  return `${bom}${rows.map((row) => row.map(escape).join(",")).join("\r\n")}\r\n`;
}

module.exports = {
  buildCountCsv,
  buildSheet,
  cancelCount,
  completeCount,
  createCount,
  getCount,
  listCounts,
  refreshBaseline,
  saveCountedQuantities,
};
