const express = require("express");
const profitReportService = require("../services/profitReportService");
const { auth, requirePermission } = require("../middleware/auth");

const router = express.Router();

// Revenue, cost of goods and margin are financial figures, so this router sits
// behind analytics.view rather than the general dashboard permission.
router.use(auth, requirePermission("analytics.view"));

function sendReportError(res, error, fallback) {
  const status = error?.statusCode || error?.status || 500;
  return res.status(status).json({
    success: false,
    message: error?.statusCode ? error.message : fallback,
  });
}

// GET /api/admin/reports/profit - revenue, COGS and gross profit over a period
router.get("/profit", async (req, res) => {
  try {
    const report = await profitReportService.getProfitReport(req.query);
    return res.json({ success: true, data: report });
  } catch (error) {
    return sendReportError(res, error, "Không thể tải báo cáo lợi nhuận");
  }
});

// GET /api/admin/reports/profit/export.csv - the same report as a spreadsheet
router.get("/profit/export.csv", async (req, res) => {
  try {
    await profitReportService.writeProfitCsv(res, req.query);
  } catch (error) {
    // The CSV streams as it aggregates, so once the headers are out the only
    // honest thing left is to close the truncated download.
    if (res.headersSent) return res.end();
    return sendReportError(res, error, "Không thể xuất báo cáo lợi nhuận");
  }
});

// GET /api/admin/reports/group-options - enum for the filter UI
router.get("/group-options", (_req, res) => {
  return res.json({
    success: true,
    data: { groupBy: Object.values(profitReportService.GROUP_BY) },
  });
});

module.exports = router;
