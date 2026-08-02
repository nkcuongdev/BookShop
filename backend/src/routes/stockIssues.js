const express = require("express");
const StockIssue = require("../models/StockIssue");
const issueService = require("../services/stockIssueService");
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

// GET /api/admin/stock-issues/types - enum for the form
router.get("/types", (_req, res) => {
  return res.json({ success: true, data: { types: StockIssue.ISSUE_TYPES } });
});

// GET /api/admin/stock-issues
router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const data = await issueService.listIssues(req.query, { page, limit });
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /api/admin/stock-issues/:id
router.get("/:id", async (req, res) => {
  try {
    const issue = await issueService.getIssue(req.params.id);
    return res.json({ success: true, data: { issue } });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-issues - create a draft
router.post("/", requirePermission("inventory.write"), async (req, res) => {
  try {
    const issue = await issueService.createIssue(req.body || {}, req.user._id);
    return res.status(201).json({
      success: true,
      message: "Đã tạo phiếu xuất",
      data: { issue },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// PUT /api/admin/stock-issues/:id - edit a draft
router.put("/:id", requirePermission("inventory.write"), async (req, res) => {
  try {
    const issue = await issueService.updateIssue(req.params.id, req.body || {});
    return res.json({
      success: true,
      message: "Đã cập nhật phiếu xuất",
      data: { issue },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-issues/:id/confirm - take the stock out
router.post("/:id/confirm", requirePermission("inventory.write"), async (req, res) => {
  try {
    const issue = await issueService.confirmIssue(req.params.id, req.user._id);
    return res.json({
      success: true,
      message: "Đã xác nhận xuất kho",
      data: { issue },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// POST /api/admin/stock-issues/:id/cancel
router.post("/:id/cancel", requirePermission("inventory.write"), async (req, res) => {
  try {
    const issue = await issueService.cancelIssue(
      req.params.id,
      req.user._id,
      req.body?.reason
    );
    return res.json({
      success: true,
      message: "Đã huỷ phiếu xuất",
      data: { issue },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
