const AuditLog = require("../models/AuditLog");
const { parsePositiveInt } = require("../utils/security");

const { ACTIONS, CATEGORIES, ACTION_CATEGORY } = AuditLog;

/**
 * Writing and reading the admin audit trail.
 *
 * The write path is deliberately forgiving: `record` never throws. An audit
 * entry is a side effect of the real operation, and failing the operation
 * because its log line could not be written would trade a working shop for a
 * complete diary. Failures are reported to stderr so they surface in logs and
 * monitoring instead of vanishing.
 *
 * That tolerance is why the caller must record *after* the operation has
 * committed: an entry describing a change that got rolled back is worse than
 * a missing one.
 */

const MAX_VALUE_LENGTH = 500;

/** Values reach Mongo as display text; see the model's `changes` comment. */
function toDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value).slice(0, MAX_VALUE_LENGTH);
    } catch {
      return String(value).slice(0, MAX_VALUE_LENGTH);
    }
  }
  return String(value).slice(0, MAX_VALUE_LENGTH);
}

/**
 * Build change rows from a before/after pair, keeping only fields that moved.
 *
 * `fields` maps a field name to its Vietnamese label. Comparison is on the
 * display form, so 100 and "100" count as equal — the log should not claim a
 * change happened because a number arrived as a string from a JSON body.
 */
function diffFields(before = {}, after = {}, fields = {}) {
  return Object.entries(fields).reduce((rows, [field, label]) => {
    const from = toDisplayValue(before?.[field]);
    const to = toDisplayValue(after?.[field]);
    if (from !== to) rows.push({ field, label, before: from, after: to });
    return rows;
  }, []);
}

/** Actor and request provenance, snapshotted at write time. */
function describeActor(user, req) {
  return {
    actor: user?._id,
    actorName: user?.name || "",
    actorEmail: user?.email || "",
    actorRole: user?.role || "",
    ip: req?.ip || req?.socket?.remoteAddress || "",
    userAgent: String(req?.get?.("user-agent") || "").slice(0, 300),
  };
}

/**
 * Append one entry. Resolves to the saved document, or null when nothing was
 * written — either because the write failed, or because `changes` was supplied
 * but empty, which means the request did not actually alter anything.
 */
async function record({
  action,
  actor,
  req,
  targetType,
  targetId,
  targetLabel = "",
  changes = null,
  reason = "",
}) {
  try {
    if (!ACTION_CATEGORY[action]) {
      throw new Error(`Unknown audit action: ${action}`);
    }
    if (!actor?._id) throw new Error("Audit entry requires an actor");
    if (!targetId) throw new Error("Audit entry requires a target");
    // A no-op submit (admin saves a form without editing anything) is not
    // worth a row. `null` means the action has no field diff by nature —
    // approving a refund, for instance — and is always recorded.
    if (Array.isArray(changes) && changes.length === 0) return null;

    return await AuditLog.create({
      action,
      category: ACTION_CATEGORY[action],
      ...describeActor(actor, req),
      targetType,
      targetId,
      targetLabel: String(targetLabel || "").slice(0, 300),
      changes: changes || [],
      reason: String(reason || "").slice(0, MAX_VALUE_LENGTH),
    });
  } catch (error) {
    // Never propagate: see the module comment.
    console.error("[auditLog] failed to record entry", {
      action,
      targetType,
      targetId: String(targetId || ""),
      error: error.message,
    });
    return null;
  }
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.action && ACTION_CATEGORY[query.action]) filter.action = query.action;
  if (query.category && CATEGORIES[query.category]) filter.category = query.category;
  if (query.actor) filter.actor = query.actor;
  if (query.targetType && AuditLog.TARGET_TYPES.includes(query.targetType)) {
    filter.targetType = query.targetType;
  }
  if (query.targetId) filter.targetId = query.targetId;

  // Dates arrive as YYYY-MM-DD. `to` is inclusive of the whole day, which is
  // what a person picking "6/9" on a date filter means.
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const range = {};
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) {
    to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }
  if (Object.keys(range).length) filter.createdAt = range;

  return filter;
}

/** Newest-first page of entries matching the filter. */
async function list(query = {}, { page = 1, limit = 20 } = {}) {
  const safePage = parsePositiveInt(page, 1, 10_000);
  const safeLimit = parsePositiveInt(limit, 20, 100);
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

/**
 * Distinct actors that appear in the log, for the "người thực hiện" filter.
 * Read off the log itself rather than the user table so the dropdown lists
 * exactly who has actually done something auditable.
 */
async function listActors() {
  const rows = await AuditLog.aggregate([
    {
      $group: {
        _id: "$actor",
        name: { $last: "$actorName" },
        email: { $last: "$actorEmail" },
        role: { $last: "$actorRole" },
        count: { $sum: 1 },
        lastActionAt: { $max: "$createdAt" },
      },
    },
    { $sort: { lastActionAt: -1 } },
    { $limit: 200 },
  ]);
  return rows.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
}

module.exports = {
  ACTIONS,
  CATEGORIES,
  buildFilter,
  diffFields,
  list,
  listActors,
  record,
  toDisplayValue,
};
