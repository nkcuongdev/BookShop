const express = require("express");
const Voucher = require("../models/Voucher");
const { auth, requirePermission } = require("../middleware/auth");
const { parsePositiveInt, safeRegex } = require("../utils/security");

const router = express.Router();
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const WRITABLE_FIELDS = [
  "code",
  "type",
  "scope",
  "value",
  "minOrder",
  "maxDiscount",
  "startAt",
  "endAt",
  "usageLimit",
  "perUserLimit",
  "active",
  "publicVisible",
  "description",
];

router.use(auth, requirePermission("voucher.manage"));

const serialize = (v) => ({ ...v.toObject(), id: v._id });

function parseCampaignDate(value, { endExclusive = false } = {}) {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    // Vietnam is UTC+07:00 and has no daylight-saving transition. Date-only
    // admin input is inclusive, while storage uses an exclusive end boundary.
    return new Date(Date.UTC(year, month - 1, day + (endExclusive ? 1 : 0), -7));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Ngày chiến dịch không hợp lệ");
    error.status = 400;
    throw error;
  }
  return date;
}

function normalizeVoucherPayload(body = {}) {
  const payload = {};
  for (const field of WRITABLE_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  if (payload.code !== undefined) {
    payload.code = String(payload.code).trim().toUpperCase();
  }
  for (const field of [
    "value",
    "minOrder",
    "maxDiscount",
    "usageLimit",
    "perUserLimit",
  ]) {
    if (payload[field] !== undefined) payload[field] = Number(payload[field]);
  }
  if (payload.startAt !== undefined) {
    payload.startAt = parseCampaignDate(payload.startAt);
  }
  if (payload.endAt !== undefined) {
    payload.endAt = parseCampaignDate(payload.endAt, { endExclusive: true });
  }
  if (payload.description !== undefined) {
    payload.description = String(payload.description).trim();
  }
  if (
    payload.publicVisible !== undefined &&
    typeof payload.publicVisible !== "boolean"
  ) {
    throw new Error("publicVisible phải là boolean");
  }
  return payload;
}

function sendVoucherError(res, error) {
  const duplicate = error?.code === 11000;
  const status = duplicate ? 409 : error?.status || 400;
  return res.status(status).json({
    success: false,
    message: duplicate ? "Mã voucher đã tồn tại" : error.message,
  });
}

// GET /api/admin/vouchers
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = {};
    const searchRegex = search ? safeRegex(search) : null;
    if (searchRegex) filter.$or = [{ code: searchRegex }, { description: searchRegex }];
    const [vouchers, total] = await Promise.all([
      Voucher.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Voucher.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        vouchers: vouchers.map(serialize),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// POST /api/admin/vouchers
router.post("/", async (req, res) => {
  try {
    const payload = normalizeVoucherPayload(req.body || {});
    const required = ["code", "type", "value", "startAt", "endAt", "usageLimit"];
    for (const key of required) {
      if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
        return res.status(400).json({
          success: false,
          message: `Thiếu trường: ${key}`,
        });
      }
    }

    const exists = await Voucher.findOne({ code: payload.code });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Mã voucher đã tồn tại",
      });
    }

    const voucher = await Voucher.create(payload);
    res.status(201).json({
      success: true,
      message: "Đã tạo voucher",
      data: { voucher: serialize(voucher) },
    });
  } catch (error) {
    sendVoucherError(res, error);
  }
});

// PUT /api/admin/vouchers/:id
router.put("/:id", async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ success: false, message: "Không tìm thấy voucher" });
    }
    Object.assign(voucher, normalizeVoucherPayload(req.body || {}));
    await voucher.save();
    res.json({
      success: true,
      message: "Đã cập nhật voucher",
      data: { voucher: serialize(voucher) },
    });
  } catch (error) {
    sendVoucherError(res, error);
  }
});

// PATCH /api/admin/vouchers/:id/toggle
router.patch("/:id/toggle", async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ success: false, message: "Không tìm thấy voucher" });
    }
    voucher.active = !voucher.active;
    await voucher.save();
    res.json({
      success: true,
      data: { voucher: serialize(voucher) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// DELETE /api/admin/vouchers/:id
router.delete("/:id", async (req, res) => {
  try {
    const voucher = await Voucher.findByIdAndDelete(req.params.id);
    if (!voucher) {
      return res.status(404).json({ success: false, message: "Không tìm thấy voucher" });
    }
    res.json({ success: true, message: "Đã xoá voucher" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

module.exports = router;
