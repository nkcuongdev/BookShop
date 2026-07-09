const express = require("express");
const mongoose = require("mongoose");
const Promotion = require("../models/Promotion");
const PromotionAlertDelivery = require("../models/PromotionAlertDelivery");
const Book = require("../models/Book");
const Category = require("../models/Category");
const { auth, requirePermission } = require("../middleware/auth");
const { safeRegex, parsePositiveInt } = require("../utils/security");
const {
  processPromotionWishlistAlerts,
} = require("../services/promotionAlertService");

const router = express.Router();

router.use(auth, requirePermission("promotion.manage"));

const serialize = (p) => {
  const obj = typeof p.toObject === "function" ? p.toObject() : p;
  return {
    ...obj,
    id: obj._id,
    status: typeof p.getStatus === "function" ? p.getStatus() : undefined,
  };
};

const PROMOTION_FIELDS = [
  "name",
  "description",
  "type",
  "value",
  "startDate",
  "endDate",
  "scope",
  "books",
  "category",
  "active",
];

function pickPromotionPayload(body = {}) {
  const payload = {};
  for (const field of PROMOTION_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  if (typeof payload.name === "string") payload.name = payload.name.trim();
  if (typeof payload.description === "string") {
    payload.description = payload.description.trim();
  }
  if (payload.value !== undefined) payload.value = Number(payload.value);
  if (Array.isArray(payload.books)) {
    payload.books = [...new Set(payload.books.map(String))];
  }
  if (typeof payload.category === "string") {
    payload.category = payload.category.trim().toLowerCase();
  }
  return payload;
}

function validatePayload(payload) {
  const required = ["name", "type", "value", "startDate", "endDate", "scope"];
  for (const key of required) {
    if (
      payload[key] === undefined ||
      payload[key] === null ||
      payload[key] === ""
    ) {
      return `Thiếu trường: ${key}`;
    }
  }
  if (!["percent", "fixed"].includes(payload.type)) {
    return "Loại giảm giá không hợp lệ";
  }
  if (!["products", "category"].includes(payload.scope)) {
    return "Phạm vi áp dụng không hợp lệ";
  }
  if (!Number.isFinite(payload.value)) {
    return "Invalid promotion value";
  }
  if (payload.type === "percent" && (payload.value <= 0 || payload.value > 100)) {
    return "Phần trăm phải trong khoảng 1-100";
  }
  if (payload.type === "fixed" && payload.value <= 0) {
    return "Giá trị giảm không hợp lệ";
  }
  const startDate = new Date(payload.startDate);
  const endDate = new Date(payload.endDate);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return "Ngày kết thúc phải sau ngày bắt đầu";
  }
  if (
    payload.scope === "products" &&
    (!Array.isArray(payload.books) || payload.books.length === 0)
  ) {
    return "Vui lòng chọn ít nhất một sản phẩm";
  }
  if (
    payload.scope === "category" &&
    (typeof payload.category !== "string" || !payload.category)
  ) {
    return "Vui lòng chọn danh mục";
  }
  return null;
}

async function validateTargets(payload) {
  if (payload.scope === "products") {
    if (payload.books.some((id) => !mongoose.isValidObjectId(id))) {
      return "Invalid product list";
    }
    const count = await Book.countDocuments({ _id: { $in: payload.books } });
    if (count !== payload.books.length) {
      return "One or more products do not exist";
    }
  } else {
    const category = await Category.findOne({ slug: payload.category }).select("_id");
    if (!category) return "Category does not exist";
  }
  return null;
}

// GET /api/admin/promotions
router.get("/", async (req, res) => {
  try {
    const { search, status } = req.query;
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = {};
    if (search) {
      const r = safeRegex(search);
      if (r) {
      filter.$or = [
        { name: r },
        { description: r },
      ];
      }
    }
    const now = new Date();
    if (status === "inactive") filter.active = false;
    if (status === "upcoming") Object.assign(filter, { active: true, startDate: { $gt: now } });
    if (status === "expired") Object.assign(filter, { active: true, endDate: { $lt: now } });
    if (status === "active") Object.assign(filter, {
      active: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    const [promotions, total] = await Promise.all([
      Promotion.find(filter)
        .populate("books", "title author imageUrl price category")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Promotion.countDocuments(filter),
    ]);
    const list = promotions.map(serialize);

    res.json({
      success: true,
      data: {
        promotions: list,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// GET /api/admin/promotions/:id
router.get("/:id", async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id).populate(
      "books",
      "title author imageUrl price category"
    );
    if (!promotion) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khuyến mãi" });
    }
    res.json({ success: true, data: { promotion: serialize(promotion) } });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// POST /api/admin/promotions
router.post("/", async (req, res) => {
  try {
    const payload = pickPromotionPayload(req.body);
    const err = validatePayload(payload) || (await validateTargets(payload));
    if (err) return res.status(400).json({ success: false, message: err });

    // Clean data based on scope
    if (payload.scope === "category") payload.books = [];
    if (payload.scope === "products") payload.category = "";

    const promotion = await Promotion.create(payload);
    const populated = await promotion.populate(
      "books",
      "title author imageUrl price category"
    );
    await processPromotionWishlistAlerts(promotion, req).catch((error) => {
      console.error("[promotionAlerts] Immediate create alert failed:", error.message);
    });

    res.status(201).json({
      success: true,
      message: "Đã tạo khuyến mãi",
      data: { promotion: serialize(populated) },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PUT /api/admin/promotions/:id
router.put("/:id", async (req, res) => {
  try {
    const payload = pickPromotionPayload(req.body);
    const err = validatePayload(payload) || (await validateTargets(payload));
    if (err) return res.status(400).json({ success: false, message: err });

    if (payload.scope === "category") payload.books = [];
    if (payload.scope === "products") payload.category = "";
    payload.wishlistAlertProcessedAt = null;

    const promotion = await Promotion.findByIdAndUpdate(
      req.params.id,
      payload,
      { returnDocument: "after", runValidators: true }
    ).populate("books", "title author imageUrl price category");

    if (!promotion) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khuyến mãi" });
    }
    await processPromotionWishlistAlerts(promotion, req).catch((error) => {
      console.error("[promotionAlerts] Immediate update alert failed:", error.message);
    });

    res.json({
      success: true,
      message: "Đã cập nhật khuyến mãi",
      data: { promotion: serialize(promotion) },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PATCH /api/admin/promotions/:id/toggle
router.patch("/:id/toggle", async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khuyến mãi" });
    }
    promotion.active = !promotion.active;
    promotion.wishlistAlertProcessedAt = null;
    await promotion.save();
    const populated = await promotion.populate(
      "books",
      "title author imageUrl price category"
    );
    await processPromotionWishlistAlerts(promotion, req).catch((error) => {
      console.error("[promotionAlerts] Immediate toggle alert failed:", error.message);
    });
    res.json({ success: true, data: { promotion: serialize(populated) } });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// DELETE /api/admin/promotions/:id
router.delete("/:id", async (req, res) => {
  try {
    const promotion = await Promotion.findByIdAndDelete(req.params.id);
    if (!promotion) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khuyến mãi" });
    }
    await PromotionAlertDelivery.deleteMany({ promotion: promotion._id });
    res.json({ success: true, message: "Đã xoá khuyến mãi" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// GET /api/admin/promotions/util/books - lightweight book list for picker
router.get("/util/books", async (req, res) => {
  try {
    const { search, category, limit = 50 } = req.query;
    const filter = {};
    if (search) {
      const r = safeRegex(search);
      if (r) filter.$or = [{ title: r }, { author: r }];
    }
    if (category) filter.category = category;

    const books = await Book.find(filter)
      .select("title author imageUrl price category stock")
      .sort({ title: 1 })
      .limit(parsePositiveInt(limit, 50, 200));

    res.json({
      success: true,
      data: {
        books: books.map((b) => ({ ...b.toObject(), id: b._id })),
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: error.message });
  }
});

module.exports = router;
