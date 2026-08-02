const mongoose = require("mongoose");
const StockReceipt = require("../models/StockReceipt");
const Supplier = require("../models/Supplier");
const inventoryService = require("./inventoryService");
const { runInTransaction } = require("../utils/transaction");
const {
  StockDocumentError,
  badStatus,
  buildDocumentFilter,
  ledgerEntriesFor,
  nextCode,
  normalizeItems,
  notFound,
  parseDateOrNull,
} = require("./stockDocumentService");

const REF_TYPE = "StockReceipt";
const POPULATE = [
  { path: "supplier", select: "code name phone paymentTerms" },
  { path: "createdBy", select: "name email" },
  { path: "confirmedBy", select: "name email" },
  { path: "items.book", select: "title imageUrl isbn stock costPrice" },
];

async function assertSupplier(supplierId, session = null) {
  if (!mongoose.isValidObjectId(String(supplierId || ""))) {
    throw new StockDocumentError("Nhà cung cấp không hợp lệ", "INVALID_SUPPLIER");
  }
  const supplier = await Supplier.findById(supplierId)
    .select("_id status name")
    .session(session || null)
    .lean();
  if (!supplier) throw notFound("nhà cung cấp");
  if (supplier.status !== "active") {
    throw new StockDocumentError(
      `Nhà cung cấp "${supplier.name}" đang ngừng hoạt động`,
      "SUPPLIER_INACTIVE"
    );
  }
  return supplier;
}

function pickHeaderFields(body = {}) {
  const header = {};
  if (body.supplier !== undefined) header.supplier = body.supplier;
  if (body.invoiceNumber !== undefined) {
    header.invoiceNumber = String(body.invoiceNumber).trim().slice(0, 100);
  }
  if (body.invoiceDate !== undefined) {
    header.invoiceDate = parseDateOrNull(body.invoiceDate);
  }
  if (body.receivedAt !== undefined) {
    header.receivedAt = parseDateOrNull(body.receivedAt) || new Date();
  }
  if (body.note !== undefined) header.note = String(body.note).slice(0, 1000);
  for (const field of ["discount", "shippingFee"]) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0) {
      throw new StockDocumentError(`Giá trị ${field} không hợp lệ`, "INVALID_AMOUNT");
    }
    header[field] = Math.round(value);
  }
  return header;
}

async function listReceipts(query = {}, { page = 1, limit = 20 } = {}) {
  const filter = buildDocumentFilter(query, { statuses: StockReceipt.RECEIPT_STATUS });
  if (query.supplier && mongoose.isValidObjectId(query.supplier)) {
    filter.supplier = new mongoose.Types.ObjectId(String(query.supplier));
  }
  if (query.search) {
    filter.$or = [
      { code: new RegExp(`^${String(query.search).trim().toUpperCase()}`) },
      { invoiceNumber: new RegExp(String(query.search).trim(), "i") },
    ];
  }
  const [receipts, total] = await Promise.all([
    StockReceipt.find(filter)
      .populate("supplier", "code name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockReceipt.countDocuments(filter),
  ]);
  return {
    receipts,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function getReceipt(id) {
  if (!mongoose.isValidObjectId(String(id))) throw notFound("phiếu nhập");
  const receipt = await StockReceipt.findById(id).populate(POPULATE).lean();
  if (!receipt) throw notFound("phiếu nhập");
  return receipt;
}

/**
 * Create a draft. Nothing touches stock until it is confirmed, so a draft can
 * be edited or thrown away freely.
 */
async function createReceipt(body = {}, userId) {
  const header = pickHeaderFields(body);
  await assertSupplier(header.supplier);
  const items = await normalizeItems(body.items, { requireCost: true });

  const code = await nextCode("stockReceipt", "PN");
  const receipt = await StockReceipt.create({
    ...header,
    code,
    items,
    status: "DRAFT",
    createdBy: userId,
  });
  return getReceipt(receipt._id);
}

async function updateReceipt(id, body = {}) {
  const receipt = await StockReceipt.findById(id);
  if (!receipt) throw notFound("phiếu nhập");
  if (receipt.status !== "DRAFT") {
    throw badStatus("Chỉ sửa được phiếu nhập ở trạng thái nháp");
  }

  const header = pickHeaderFields(body);
  if (header.supplier) await assertSupplier(header.supplier);
  Object.assign(receipt, header);
  if (body.items !== undefined) {
    receipt.items = await normalizeItems(body.items, { requireCost: true });
  }
  try {
    await receipt.save();
  } catch (error) {
    if (error?.name === "VersionError") {
      throw badStatus("Phiếu nhập đã thay đổi hoặc được xác nhận trong lúc chỉnh sửa");
    }
    throw error;
  }
  return getReceipt(receipt._id);
}

/**
 * Confirm a draft: raise stock, recalculate moving-average cost and write a
 * PURCHASE_IN ledger row per line, all inside one transaction. Afterwards the
 * document is frozen — corrections happen through a reversing document.
 */
async function confirmReceipt(id, userId) {
  await runInTransaction(async (session) => {
    const receipt = await StockReceipt.findById(id).session(session);
    if (!receipt) throw notFound("phiếu nhập");
    if (receipt.status !== "DRAFT") {
      throw badStatus("Chỉ xác nhận được phiếu nhập ở trạng thái nháp");
    }
    if (!receipt.items.length) {
      throw new StockDocumentError("Phiếu nhập không có dòng nào", "EMPTY_ITEMS");
    }

    await inventoryService.applyBatch(
      receipt.items.map((item) => ({
        bookId: item.book,
        type: "PURCHASE_IN",
        quantity: item.quantity,
        unitCost: item.unitCost,
        refType: REF_TYPE,
        refId: receipt._id,
        refCode: receipt.code,
        reason: "Nhập hàng từ nhà cung cấp",
        performedBy: userId,
      })),
      session
    );

    receipt.status = "CONFIRMED";
    receipt.confirmedAt = new Date();
    receipt.confirmedBy = userId;
    await receipt.save({ session });
  });
  return getReceipt(id);
}

/**
 * Cancel a receipt. A draft is simply voided; a confirmed one is reversed with
 * mirrored ledger rows so history is preserved.
 *
 * The reversal is valued at the original purchase price, so the units leave at
 * the cost they came in at and the moving-average is recomputed from the value
 * that remains. With no intervening movement this restores the exact prior
 * cost; if sales or other receipts happened in between it books the honest
 * remaining value rather than pretending the old average can be recovered.
 */
async function cancelReceipt(id, userId, reason = "") {
  const normalizedReason = String(reason || "").trim().slice(0, 500);
  await runInTransaction(async (session) => {
    const receipt = await StockReceipt.findById(id).session(session);
    if (!receipt) throw notFound("phiếu nhập");
    if (receipt.status === "CANCELLED") {
      throw badStatus("Phiếu nhập đã bị huỷ trước đó");
    }

    if (receipt.status === "CONFIRMED") {
      if (!normalizedReason) {
        throw new StockDocumentError(
          "Huỷ phiếu nhập đã xác nhận bắt buộc có lý do",
          "REASON_REQUIRED"
        );
      }
      const entries = await ledgerEntriesFor(REF_TYPE, receipt._id, session);
      for (const entry of entries) {
        // Only reverse the inbound rows this document created; a previous
        // partial reversal must not be undone twice.
        if (entry.quantity <= 0) continue;
        await inventoryService.applyMovement(
          {
            bookId: entry.book,
            // PURCHASE_REVERSAL, not TRANSFER_OUT: the units have to leave at
            // the price they arrived at so the moving-average cost is backed
            // out too. Reversing only the quantity would leave a mistaken
            // purchase price baked into the average for good.
            type: "PURCHASE_REVERSAL",
            quantity: entry.quantity,
            unitCost: entry.unitCost,
            refType: REF_TYPE,
            refId: receipt._id,
            refCode: receipt.code,
            reason: `Huỷ phiếu nhập ${receipt.code}: ${normalizedReason}`,
            performedBy: userId,
          },
          session
        );
      }
    }

    receipt.status = "CANCELLED";
    receipt.cancelledAt = new Date();
    receipt.cancelReason = normalizedReason;
    await receipt.save({ session });
  });
  return getReceipt(id);
}

/** Purchase volume and spend per supplier, for the supplier detail screen. */
function getSupplierSummary(supplierId) {
  return StockReceipt.aggregate([
    {
      $match: {
        supplier: new mongoose.Types.ObjectId(String(supplierId)),
        status: "CONFIRMED",
      },
    },
    {
      $group: {
        _id: null,
        receipts: { $sum: 1 },
        totalUnits: { $sum: { $sum: "$items.quantity" } },
        totalAmount: { $sum: "$totalAmount" },
        lastReceivedAt: { $max: "$confirmedAt" },
      },
    },
  ]);
}

module.exports = {
  cancelReceipt,
  confirmReceipt,
  createReceipt,
  getReceipt,
  getSupplierSummary,
  listReceipts,
  updateReceipt,
};
