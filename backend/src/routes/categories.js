const express = require("express");
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Book = require("../models/Book");
const Promotion = require("../models/Promotion");
const { auth, requirePermission } = require("../middleware/auth");
const {
  queueManagedAssetsForDeletion,
  syncManagedAssets,
} = require("../services/assetLifecycleService");

const router = express.Router();

// GET /api/categories - Get all categories (public)
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();

    res.json({
      success: true,
      data: {
        categories: categories.map((category) => ({ ...category, id: category._id })),
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
router.post("/", auth, requirePermission("category.manage"), async (req, res) => {
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

    const categoryId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    let category;
    try {
      await session.withTransaction(async () => {
        [category] = await Category.create(
          [{
            _id: categoryId,
            name,
            slug: slug.toLowerCase(),
            description,
            image,
          }],
          { session }
        );
        await syncManagedAssets({
          entityType: "category",
          purpose: "category",
          entityLabel: "danh mục",
          entityId: categoryId,
          ownerId: req.user._id,
          urls: [category.image],
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    res.status(201).json({
      success: true,
      message: "Thêm danh mục thành công",
      data: { category: { ...category.toObject(), id: category._id } },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// PUT /api/categories/:id - Update category (admin only)
router.put("/:id", auth, requirePermission("category.manage"), async (req, res) => {
  try {
    const { name, slug, description, image } = req.body;
    const existingCategory = await Category.findById(req.params.id);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }
    const nextSlug = slug
      ? String(slug).trim().toLowerCase()
      : existingCategory.slug;

    // Check unique slug if changing
    if (nextSlug !== existingCategory.slug) {
      const existing = await Category.findOne({
        slug: nextSlug,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Slug đã tồn tại",
        });
      }
    }

    const update = { slug: nextSlug };
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = description;
    if (image !== undefined) update.image = image;

    const session = await mongoose.startSession();
    let category;
    try {
      await session.withTransaction(async () => {
        category = await Category.findByIdAndUpdate(req.params.id, update, {
          returnDocument: "after",
          runValidators: true,
          session,
        });

        if (category) {
          await syncManagedAssets({
            entityType: "category",
            purpose: "category",
            entityLabel: "danh mục",
            entityId: category._id,
            ownerId: req.user._id,
            urls: [category.image],
            session,
            retainedLegacyUrls: [existingCategory.image],
          });
        }

        await Promise.all([
          Book.updateMany(
            {
              category: {
                $in: [existingCategory.slug, String(existingCategory._id)],
              },
            },
            { $set: { category: nextSlug } },
            { session }
          ),
          Promotion.updateMany(
            {
              scope: "category",
              category: {
                $in: [existingCategory.slug, existingCategory.name],
              },
            },
            { $set: { category: nextSlug } },
            { session }
          ),
        ]);
      });
    } finally {
      await session.endSession();
    }

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
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// DELETE /api/categories/:id - Delete category (admin only)
router.delete("/:id", auth, requirePermission("category.manage"), async (req, res) => {
  try {
    const session = await mongoose.startSession();
    let category;
    try {
      await session.withTransaction(async () => {
        const existingCategory = await Category.findOneAndUpdate(
          { _id: req.params.id },
          { $set: { integrityGuardAt: new Date() } },
          { returnDocument: "after", session }
        );
        if (!existingCategory) {
          const error = new Error("Không tìm thấy danh mục");
          error.statusCode = 404;
          throw error;
        }
        const bookCount = await Book.countDocuments({
          category: { $in: [existingCategory.slug, String(existingCategory._id)] },
        }).session(session);
        const promotionCount = await Promotion.countDocuments({
          scope: "category",
          category: { $in: [existingCategory.slug, existingCategory.name] },
        }).session(session);
        if (bookCount > 0 || promotionCount > 0) {
          const error = new Error(
            "Danh mục đang có sách hoặc khuyến mãi, không thể xóa"
          );
          error.statusCode = 409;
          error.code = "CATEGORY_IN_USE";
          throw error;
        }
        category = await Category.findByIdAndDelete(req.params.id, { session });
        if (category) {
          await queueManagedAssetsForDeletion("category", category._id, session);
        }
      });
    } finally {
      await session.endSession();
    }

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
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : "Lỗi server",
      error: error.statusCode ? undefined : error.message,
    });
  }
});

module.exports = router;
