const express = require("express");
const { once } = require("events");
const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");
const auditLogService = require("../services/auditLogService");
const { auth, requirePermission } = require("../middleware/auth");
const { parsePositiveInt } = require("../utils/security");
const {
  ACTION_LABELS,
  CATEGORY_LABELS,
  describeChanges,
} = require("../services/auditLogPresenter");

const router = express.Router();

// Reading the trail is itself a privileged, admin-only act: it exposes who did
// what across money, stock and accounts.
router.use(auth, requirePermission("audit.read"));

/**
 * Mongo throws on a malformed ObjectId in a filter, which would turn a typo in
 * a query string into a 500. Drop unusable ids instead.
 */
function validObjectId(value) {
  return value && mongoose.isValidObjectId(value) ? String(value) : undefined;
}

function readFilters(query = {}) {
  return {
    action: query.action,
    category: query.category,
    actor: validObjectId(query.actor),
    targetType: query.targetType,
    targetId: validObjectId(query.targetId),
    from: query.from,
    to: query.to,
  };
}

// GET /api/admin/audit-logs - newest-first, filterable
router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const { items, pagination } = await auditLogService.list(
      readFilters(req.query),
      { page, limit }
    );
    return res.json({
      success: true,
      data: {
        items: items.map((entry) => ({
          ...entry,
          id: entry._id,
          actionLabel: ACTION_LABELS[entry.action] || entry.action,
          categoryLabel: CATEGORY_LABELS[entry.category] || entry.category,
          summary: describeChanges(entry),
        })),
        pagination,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// GET /api/admin/audit-logs/meta - filter vocabulary for the UI
router.get("/meta", async (_req, res) => {
  try {
    const actors = await auditLogService.listActors();
    return res.json({
      success: true,
      data: {
        actors,
        actions: Object.entries(ACTION_LABELS).map(([value, label]) => ({
          value,
          label,
          category: AuditLog.ACTION_CATEGORY[value],
        })),
        categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

const CSV_HEADERS = [
  "Thời điểm",
  "Người thực hiện",
  "Email",
  "Vai trò",
  "Nhóm",
  "Hành động",
  "Đối tượng",
  "Thay đổi",
  "Lý do",
  "IP",
];

/**
 * Quote every cell, and neutralise values a spreadsheet would read as a
 * formula. Mirrors the order-report exporter.
 */
function csvCell(value) {
  let normalized = String(value ?? "").replace(/\r\n?/g, "\n");
  if (/^[=+\-@]/.test(normalized)) normalized = `'${normalized}`;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function csvRow(entry) {
  return `${[
    entry.createdAt ? new Date(entry.createdAt).toISOString() : "",
    entry.actorName,
    entry.actorEmail,
    entry.actorRole,
    CATEGORY_LABELS[entry.category] || entry.category,
    ACTION_LABELS[entry.action] || entry.action,
    entry.targetLabel,
    describeChanges(entry),
    entry.reason,
    entry.ip,
  ]
    .map(csvCell)
    .join(",")}\r\n`;
}

// GET /api/admin/audit-logs/export - the current filter as CSV
router.get("/export", async (req, res, next) => {
  try {
    const filter = auditLogService.buildFilter(readFilters(req.query));
    const filename = `bookshop-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    res.status(200);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    // The BOM makes Excel read the Vietnamese labels as UTF-8.
    res.write(`\uFEFF${CSV_HEADERS.map(csvCell).join(",")}\r\n`);

    const cursor = AuditLog.find(filter).sort({ createdAt: -1 }).lean().cursor();
    for await (const entry of cursor) {
      if (!res.write(csvRow(entry))) await once(res, "drain");
    }
    return res.end();
  } catch (error) {
    // Once the CSV body has started streaming the status line is already sent;
    // hand off to the error handler only while the headers are still open.
    if (res.headersSent) return res.destroy(error);
    return next(error);
  }
});

module.exports = router;
