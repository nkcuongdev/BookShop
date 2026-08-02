const express = require("express");
const countService = require("../services/stockCountService");
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

// GET /api/admin/stock-counts
router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const data = await countService.listCounts(req.query, { page, limit });
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /api/admin/stock-counts/:id
router.get("/:id", async (req, res) => {
  try {
    const count = await countService.getCount(req.params.id);
    return res.json({ success: true, data: { count } });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /api/admin/stock-counts/:id/export - printable count sheet
router.get("/:id/export", async (req, res) => {
  try {
    const count = await countService.getCount(req.params.id);
    const csv = countService.buildCountCsv(count);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${count.code}.csv"`
    );
    return res.send(csv);
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-counts - generate a sheet and start counting
router.post("/", requirePermission("inventory.write"), async (req, res) => {
  try {
    const count = await countService.createCount(req.body || {}, req.user._id);
    return res.status(201).json({
      success: true,
      message: "Đã tạo phiếu kiểm kho",
      data: { count },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// PUT /api/admin/stock-counts/:id/items - record counted quantities
router.put("/:id/items", requirePermission("inventory.write"), async (req, res) => {
  try {
    const count = await countService.saveCountedQuantities(
      req.params.id,
      req.body?.items
    );
    return res.json({
      success: true,
      message: "Đã lưu số đếm",
      data: { count },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-counts/:id/complete - apply the differences
router.post("/:id/complete", requirePermission("inventory.write"), async (req, res) => {
  try {
    const count = await countService.completeCount(req.params.id, req.user._id);
    return res.json({
      success: true,
      message: "Đã hoàn tất kiểm kho",
      data: { count },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-counts/:id/refresh - re-freeze the baseline so a sheet
// interrupted by real stock movement can be recounted instead of cancelled.
router.post("/:id/refresh", requirePermission("inventory.write"), async (req, res) => {
  try {
    const { count, changed } = await countService.refreshBaseline(req.params.id);
    return res.json({
      success: true,
      message: changed.length
        ? `Đã cập nhật mốc tồn cho ${changed.length} dòng, vui lòng đếm lại các dòng này`
        : "Mốc tồn vẫn khớp, không có dòng nào cần đếm lại",
      data: { count, changed },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-counts/:id/cancel
router.post("/:id/cancel", requirePermission("inventory.write"), async (req, res) => {
  try {
    const count = await countService.cancelCount(req.params.id, req.body?.reason);
    return res.json({
      success: true,
      message: "Đã huỷ phiếu kiểm kho",
      data: { count },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
