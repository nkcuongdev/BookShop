const express = require("express");
const Promotion = require("../models/Promotion");
const Book = require("../models/Book");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(auth, adminOnly);

const serialize = (p) => {
  const obj = typeof p.toObject === "function" ? p.toObject() : p;
  return {
    ...obj,
    id: obj._id,
    status: typeof p.getStatus === "function" ? p.getStatus() : undefined,
  };
};

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
  if (payload.type === "percent" && (payload.value <= 0 || payload.value > 100)) {
    return "Phần trăm phải trong khoảng 1-100";
  }
  if (payload.type === "fixed" && payload.value < 0) {
    return "Giá trị giảm không hợp lệ";
  }
  if (new Date(payload.endDate) <= new Date(payload.startDate)) {
    return "Ngày kết thúc phải sau ngày bắt đầu";
  }
  if (payload.scope === "products" && (!payload.books || payload.books.length === 0)) {
    return "Vui lòng chọn ít nhất một sản phẩm";
  }
  if (payload.scope === "category" && !payload.category) {
    return "Vui lòng chọn danh mục";
  }
  return null;
}

// GET /api/admin/promotions
router.get("/", async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }
    const promotions = await Promotion.find(filter)
      .populate("books", "title author imageUrl price category")
      .sort({ createdAt: -1 });

    let list = promotions.map(serialize);
    if (status) {
      list = list.filter((p) => p.status === status);
    }

    res.json({
      success: true,
      data: { promotions: list },
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
    const payload = req.body || {};
    const err = validatePayload(payload);
    if (err) return res.status(400).json({ success: false, message: err });

    // Clean data based on scope
    if (payload.scope === "category") payload.books = [];
    if (payload.scope === "products") payload.category = "";

    const promotion = await Promotion.create(payload);
    const populated = await promotion.populate(
      "books",
      "title author imageUrl price category"
    );

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
    const payload = req.body || {};
    const err = validatePayload(payload);
    if (err) return res.status(400).json({ success: false, message: err });

    if (payload.scope === "category") payload.books = [];
    if (payload.scope === "products") payload.category = "";

    const promotion = await Promotion.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).populate("books", "title author imageUrl price category");

    if (!promotion) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khuyến mãi" });
    }

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
    await promotion.save();
    const populated = await promotion.populate(
      "books",
      "title author imageUrl price category"
    );
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
      const r = new RegExp(search, "i");
      filter.$or = [{ title: r }, { author: r }];
    }
    if (category) filter.category = category;

    const books = await Book.find(filter)
      .select("title author imageUrl price category stock")
      .sort({ title: 1 })
      .limit(Math.min(parseInt(limit) || 50, 200));

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
