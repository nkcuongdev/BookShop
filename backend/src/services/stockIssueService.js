const mongoose = require("mongoose");
const StockIssue = require("../models/StockIssue");
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
  stampCurrentCosts,
} = require("./stockDocumentService");

const REF_TYPE = "StockIssue";
const POPULATE = [
  { path: "supplier", select: "code name" },
  { path: "createdBy", select: "name email" },
  { path: "confirmedBy", select: "name email" },
  { path: "items.book", select: "title imageUrl isbn stock costPrice" },
];

/**
 * Write-offs (damaged, lost) are booked as DAMAGE_OUT so the loss shows up
 * separately in reports; everything else is a deliberate TRANSFER_OUT.
 */
function movementTypeFor(issueType) {
  return StockIssue.DAMAGE_TYPES.has(issueType) ? "DAMAGE_OUT" : "TRANSFER_OUT";
}

function pickHeaderFields(body = {}) {
  const header = {};
  if (body.type !== undefined) {
    if (!StockIssue.ISSUE_TYPES.includes(body.type)) {
      throw new StockDocumentError("Loại phiếu xuất không hợp lệ", "INVALID_TYPE");
    }
    header.type = body.type;
  }
  if (body.reason !== undefined) {
    header.reason = String(body.reason).trim().slice(0, 500);
  }
  if (body.supplier !== undefined) header.supplier = body.supplier || null;
  if (body.issuedAt !== undefined) {
    header.issuedAt = parseDateOrNull(body.issuedAt) || new Date();
  }
  if (body.note !== undefined) header.note = String(body.note).slice(0, 1000);
  return header;
}

async function assertSupplierWhenReturning(type, supplierId) {
  if (type !== "RETURN_SUPPLIER") return;
  if (!mongoose.isValidObjectId(String(supplierId || ""))) {
    throw new StockDocumentError(
      "Trả hàng nhà cung cấp cần chọn nhà cung cấp",
      "SUPPLIER_REQUIRED"
    );
  }
  const supplier = await Supplier.findById(supplierId).select("_id").lean();
  if (!supplier) throw notFound("nhà cung cấp");
}

async function listIssues(query = {}, { page = 1, limit = 20 } = {}) {
  const filter = buildDocumentFilter(query, { statuses: StockIssue.ISSUE_STATUS });
  if (query.type && StockIssue.ISSUE_TYPES.includes(query.type)) {
    filter.type = query.type;
  }
  if (query.search) {
    filter.code = new RegExp(`^${String(query.search).trim().toUpperCase()}`);
  }
  const [issues, total] = await Promise.all([
    StockIssue.find(filter)
      .populate("supplier", "code name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockIssue.countDocuments(filter),
  ]);
  return {
    issues,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function getIssue(id) {
  if (!mongoose.isValidObjectId(String(id))) throw notFound("phiếu xuất");
  const issue = await StockIssue.findById(id).populate(POPULATE).lean();
  if (!issue) throw notFound("phiếu xuất");
  return issue;
}

async function createIssue(body = {}, userId) {
  const header = pickHeaderFields(body);
  if (!header.type) {
    throw new StockDocumentError("Thiếu loại phiếu xuất", "INVALID_TYPE");
  }
  if (!header.reason) {
    throw new StockDocumentError("Phiếu xuất bắt buộc có lý do", "REASON_REQUIRED");
  }
  await assertSupplierWhenReturning(header.type, header.supplier);
  const items = await normalizeItems(body.items);

  const code = await nextCode("stockIssue", "PX");
  const issue = await StockIssue.create({
    ...header,
    code,
    items,
    status: "DRAFT",
    createdBy: userId,
  });
  return getIssue(issue._id);
}

async function updateIssue(id, body = {}) {
  const issue = await StockIssue.findById(id);
  if (!issue) throw notFound("phiếu xuất");
  if (issue.status !== "DRAFT") {
    throw badStatus("Chỉ sửa được phiếu xuất ở trạng thái nháp");
  }

  const header = pickHeaderFields(body);
  Object.assign(issue, header);
  await assertSupplierWhenReturning(issue.type, issue.supplier);
  if (body.items !== undefined) {
    issue.items = await normalizeItems(body.items);
  }
  try {
    await issue.save();
  } catch (error) {
    if (error?.name === "VersionError") {
      throw badStatus("Phiếu xuất đã thay đổi hoặc được xác nhận trong lúc chỉnh sửa");
    }
    throw error;
  }
  return getIssue(issue._id);
}

/**
 * Confirm a draft: value each line at the book's current moving-average cost,
 * then take the stock out and write the ledger. Insufficient stock aborts the
 * whole transaction.
 */
async function confirmIssue(id, userId) {
  await runInTransaction(async (session) => {
    const issue = await StockIssue.findById(id).session(session);
    if (!issue) throw notFound("phiếu xuất");
    if (issue.status !== "DRAFT") {
      throw badStatus("Chỉ xác nhận được phiếu xuất ở trạng thái nháp");
    }
    if (!issue.items.length) {
      throw new StockDocumentError("Phiếu xuất không có dòng nào", "EMPTY_ITEMS");
    }

    // The loss is valued at what the goods actually cost us, not at a figure
    // the admin typed in.
    await stampCurrentCosts(issue.items, session);

    const movementType = movementTypeFor(issue.type);
    await inventoryService.applyBatch(
      issue.items.map((item) => ({
        bookId: item.book,
        type: movementType,
        quantity: item.quantity,
        unitCost: item.unitCost,
        refType: REF_TYPE,
        refId: issue._id,
        refCode: issue.code,
        reason: issue.reason,
        performedBy: userId,
      })),
      session
    );

    issue.status = "CONFIRMED";
    issue.confirmedAt = new Date();
    issue.confirmedBy = userId;
    await issue.save({ session });
  });
  return getIssue(id);
}

/**
 * Cancel an issue. A draft is voided; a confirmed one has its stock put back
 * with an ADJUSTMENT so the reversal is visible in the ledger.
 */
async function cancelIssue(id, userId, reason = "") {
  const normalizedReason = String(reason || "").trim().slice(0, 500);
  await runInTransaction(async (session) => {
    const issue = await StockIssue.findById(id).session(session);
    if (!issue) throw notFound("phiếu xuất");
    if (issue.status === "CANCELLED") {
      throw badStatus("Phiếu xuất đã bị huỷ trước đó");
    }

    if (issue.status === "CONFIRMED") {
      if (!normalizedReason) {
        throw new StockDocumentError(
          "Huỷ phiếu xuất đã xác nhận bắt buộc có lý do",
          "REASON_REQUIRED"
        );
      }
      const entries = await ledgerEntriesFor(REF_TYPE, issue._id, session);
      for (const entry of entries) {
        // Only reverse the outbound rows this document created.
        if (entry.quantity >= 0) continue;
        await inventoryService.applyMovement(
          {
            bookId: entry.book,
            type: "CANCEL_IN",
            quantity: Math.abs(entry.quantity),
            unitCost: entry.unitCost,
            refType: REF_TYPE,
            refId: issue._id,
            refCode: issue.code,
            reason: `Huỷ phiếu xuất ${issue.code}: ${normalizedReason}`,
            performedBy: userId,
          },
          session
        );
      }
    }

    issue.status = "CANCELLED";
    issue.cancelledAt = new Date();
    issue.cancelReason = normalizedReason;
    await issue.save({ session });
  });
  return getIssue(id);
}

module.exports = {
  cancelIssue,
  confirmIssue,
  createIssue,
  getIssue,
  listIssues,
  movementTypeFor,
  updateIssue,
};
