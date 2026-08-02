const express = require("express");
const mongoose = require("mongoose");
const Book = require("../models/Book");
const StockLedger = require("../models/StockLedger");
const inventoryService = require("../services/inventoryService");
const { auth, requirePermission } = require("../middleware/auth");
const { parsePositiveInt } = require("../utils/security");
const { runInTransaction } = require("../utils/transaction");
const auditLogService = require("../services/auditLogService");
const { FIELD_LABELS } = require("../services/auditLogPresenter");

const router = express.Router();

router.use(auth, requirePermission("inventory.read"));

function sendInventoryError(res, error) {
  const status = error?.statusCode || error?.status || 500;
  return res.status(status).json({
    success: false,
    message: error?.message || "Lỗi server",
    code: error?.code || undefined,
  });
}

// GET /api/admin/inventory/ledger - movement history across all books
router.get("/ledger", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const result = await inventoryService.getLedger(req.query, { page, limit });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});

// GET /api/admin/inventory/books/:id/ledger - movement history for one book
router.get("/books/:id/ledger", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Không tìm thấy sách" });
    }
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const book = await Book.findById(req.params.id)
      .select("title imageUrl isbn stock costPrice reorderPoint reorderQuantity lastCountedAt")
      .lean();
    if (!book) {
      return res.status(404).json({ success: false, message: "Không tìm thấy sách" });
    }
    const result = await inventoryService.getLedger(
      { ...req.query, book: req.params.id },
      { page, limit }
    );
    return res.json({ success: true, data: { book, ...result } });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});

// POST /api/admin/inventory/adjust - manual correction, reason required
router.post("/adjust", requirePermission("inventory.adjust"), async (req, res) => {
  try {
    const { bookId, quantity, reason } = req.body || {};
    const delta = Number(quantity);
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({
        success: false,
        message: "Số lượng điều chỉnh phải là số nguyên khác 0",
      });
    }
    if (!String(reason || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Điều chỉnh tồn kho bắt buộc có lý do",
      });
    }

    // A positive delta adds stock, a negative one removes it. Both are booked
    // as ADJUSTMENT; TRANSFER_OUT carries the sign for the outbound direction.
    //
    // The stock write and its ledger row go in one transaction: without it a
    // failed ledger insert would still leave Book.stock moved while the API
    // reports an error, and the operator's retry would adjust a second time.
    // The session also pins the stockBefore read, so two concurrent adjustments
    // cannot both book the same opening figure.
    const { book, ledger } = await runInTransaction((session) =>
      inventoryService.applyMovement(
        {
          bookId,
          type: delta > 0 ? "ADJUSTMENT" : "TRANSFER_OUT",
          quantity: Math.abs(delta),
          refType: null,
          refId: null,
          refCode: "",
          reason: String(reason).trim(),
          performedBy: req.user._id,
          appOrReq: req,
        },
        session
      )
    );

    // The ledger row already proves the movement; this entry puts the same
    // act on the cross-cutting admin trail, where it sits next to the price
    // edits and account locks made by the same person.
    await auditLogService.record({
      action: auditLogService.ACTIONS.BOOK_STOCK_ADJUST,
      actor: req.user,
      req,
      targetType: "Book",
      targetId: book._id,
      targetLabel: book.title,
      changes: [
        {
          field: "stock",
          label: FIELD_LABELS.stock,
          before: String(ledger.stockBefore),
          after: String(ledger.stockAfter),
        },
      ],
      reason: String(reason).trim(),
    });

    return res.json({
      success: true,
      message: "Đã điều chỉnh tồn kho",
      data: { book: { _id: book._id, stock: book.stock }, ledger },
    });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});

// GET /api/admin/inventory/low-stock - books at or below their reorder point
router.get("/low-stock", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const result = await inventoryService.getLowStockBooks({
      page,
      limit,
      includeOutOfStock: req.query.includeOutOfStock !== "false",
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});

// GET /api/admin/inventory/valuation - capital tied up in stock
router.get("/valuation", async (req, res) => {
  try {
    const [valuation, lowStockCount] = await Promise.all([
      inventoryService.getStockValuation(),
      inventoryService.countLowStock(),
    ]);
    return res.json({ success: true, data: { valuation, lowStockCount } });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});

// GET /api/admin/inventory/report - inbound/outbound/COGS over a period
router.get("/report", async (req, res) => {
  try {
    const report = await inventoryService.getMovementReport({
      from: req.query.from,
      to: req.query.to,
    });
    return res.json({ success: true, data: report });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});

// GET /api/admin/inventory/reconcile - books whose stock drifted from the ledger
router.get("/reconcile", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 100, 500);
    const drifts = await inventoryService.reconcileStock({ limit });
    return res.json({
      success: true,
      data: { drifts, healthy: drifts.length === 0 },
    });
  } catch (error) {
    return sendInventoryError(res, error);
  }
});

// GET /api/admin/inventory/movement-types - enum for the filter UI
router.get("/movement-types", (_req, res) => {
  return res.json({
    success: true,
    data: { types: StockLedger.MOVEMENT_TYPES },
  });
});

module.exports = router;
