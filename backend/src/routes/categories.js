const express = require("express");
const Category = require("../models/Category");
const Book = require("../models/Book");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

// GET /api/categories - Get all categories (public)
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });

    res.json({
      success: true,
      data: {
        categories: categories.map((c) => ({ ...c.toObject(), id: c._id })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// POST /api/categories - Create category (admin only)
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const { name, slug, description, image } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Tên và slug là bắt buộc",
      });
    }

    // Check unique slug
    const existing = await Category.findOne({ slug: slug.toLowerCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Slug đã tồn tại",
      });
    }

    const category = new Category({
      name,
      slug: slug.toLowerCase(),
      description,
      image,
    });
    await category.save();

    res.status(201).json({
      success: true,
      message: "Thêm danh mục thành công",
      data: { category: { ...category.toObject(), id: category._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// PUT /api/categories/:id - Update category (admin only)
router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const { name, slug, description, image } = req.body;

    // Check unique slug if changing
    if (slug) {
      const existing = await Category.findOne({
        slug: slug.toLowerCase(),
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Slug đã tồn tại",
        });
      }
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, slug: slug?.toLowerCase(), description, image },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy danh mục",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật thành công",
      data: { category: { ...category.toObject(), id: category._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// DELETE /api/categories/:id - Delete category (admin only)
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const bookCount = await Book.countDocuments({ category: req.params.id });
    if (bookCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Danh muc dang co sach, khong the xoa",
      });
    }

    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy danh mục",
      });
    }

    res.json({
      success: true,
      message: "Xóa danh mục thành công",
      data: { category: { ...category.toObject(), id: category._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

module.exports = router;
