const express = require("express");
const receiptService = require("../services/stockReceiptService");
const { auth, requirePermission } = require("../middleware/auth");
const { parsePositiveInt } = require("../utils/security");

const router = express.Router();

router.use(auth, requirePermission("inventory.read"));

function sendError(res, error) {
  const status = error?.statusCode || error?.status || 500;
  return res.status(status).json({
    success: false,
    message: error?.message || "Lỗi server",
    code: error?.code || undefined,
  });
}

// GET /api/admin/stock-receipts
router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const data = await receiptService.listReceipts(req.query, { page, limit });
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /api/admin/stock-receipts/:id
router.get("/:id", async (req, res) => {
  try {
    const receipt = await receiptService.getReceipt(req.params.id);
    return res.json({ success: true, data: { receipt } });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-receipts - create a draft
router.post("/", requirePermission("inventory.write"), async (req, res) => {
  try {
    const receipt = await receiptService.createReceipt(req.body || {}, req.user._id);
    return res.status(201).json({
      success: true,
      message: "Đã tạo phiếu nhập",
      data: { receipt },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// PUT /api/admin/stock-receipts/:id - edit a draft
router.put("/:id", requirePermission("inventory.write"), async (req, res) => {
  try {
    const receipt = await receiptService.updateReceipt(req.params.id, req.body || {});
    return res.json({
      success: true,
      message: "Đã cập nhật phiếu nhập",
      data: { receipt },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-receipts/:id/confirm - post to the ledger
router.post("/:id/confirm", requirePermission("inventory.write"), async (req, res) => {
  try {
    const receipt = await receiptService.confirmReceipt(req.params.id, req.user._id);
    return res.json({
      success: true,
      message: "Đã xác nhận nhập kho",
      data: { receipt },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-receipts/:id/cancel
router.post("/:id/cancel", requirePermission("inventory.write"), async (req, res) => {
  try {
    const receipt = await receiptService.cancelReceipt(
      req.params.id,
      req.user._id,
      req.body?.reason
    );
    return res.json({
      success: true,
      message: "Đã huỷ phiếu nhập",
      data: { receipt },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
