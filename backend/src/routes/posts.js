const express = require("express");
const mongoose = require("mongoose");
const Post = require("../models/Post");
const PostCategory = require("../models/PostCategory");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

function normalizeQueryValue(value) {
  if (value === undefined || value === null) return undefined;
  if (value === "" || value === "undefined" || value === "null") return undefined;
  return value;
}

const ALLOWED_POST_FIELDS = [
  "title",
  "slug",
  "thumbnail",
  "shortDescription",
  "content",
  "category",
  "status",
  "metaTitle",
  "metaDescription",
  "tags",
];

function pickPostPayload(body = {}) {
  const payload = {};
  for (const key of ALLOWED_POST_FIELDS) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  if (Array.isArray(payload.tags)) {
    payload.tags = payload.tags.map((t) => String(t).trim()).filter(Boolean);
  }

  if (
    payload.category === "" ||
    payload.category === null ||
    payload.category === "__none__"
  ) {
    payload.category = null;
  }

  if (typeof payload.title === "string") payload.title = payload.title.trim();
  if (typeof payload.slug === "string") payload.slug = payload.slug.trim().toLowerCase();
  if (typeof payload.shortDescription === "string") {
    payload.shortDescription = payload.shortDescription.trim();
  }
  if (typeof payload.metaTitle === "string") payload.metaTitle = payload.metaTitle.trim();
  if (typeof payload.metaDescription === "string") {
    payload.metaDescription = payload.metaDescription.trim();
  }

  return payload;
}

// =====================
// PUBLIC ROUTES
// =====================

// GET /api/posts - Get published posts (public)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy, order } = req.query;
    const category = normalizeQueryValue(req.query.category);
    const search = normalizeQueryValue(req.query.search);

    const options = {
      category,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      order,
    };

    const [posts, total] = await Promise.all([
      Post.findPublished(options),
      Post.countPublished(options),
    ]);

    res.json({
      success: true,
      data: {
        posts: posts.map((post) => ({
          ...post.toObject(),
          id: post._id,
        })),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
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

// GET /api/posts/latest - Get latest posts
router.get("/latest", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const posts = await Post.getLatestPosts(limit);

    res.json({
      success: true,
      data: {
        posts: posts.map((post) => ({
          ...post.toObject(),
          id: post._id,
        })),
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

// GET /api/posts/categories - Get active post categories (public)
router.get("/categories", async (req, res) => {
  try {
    const categories = await PostCategory.getActiveCategories();

    res.json({
      success: true,
      data: {
        categories: categories.map((cat) => ({
          ...cat.toObject(),
          id: cat._id,
        })),
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

// GET /api/posts/:slug - Get single post by slug (public)
router.get("/:slug", async (req, res) => {
  try {
    const post = await Post.findBySlug(req.params.slug);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    await Post.incrementViewCount(post._id);

    const relatedPosts = await Post.getRelatedPosts(post._id, post.category?._id);

    res.json({
      success: true,
      data: {
        post: {
          ...post.toObject(),
          id: post._id,
          viewCount: post.viewCount + 1,
        },
        relatedPosts: relatedPosts.map((p) => ({
          ...p.toObject(),
          id: p._id,
        })),
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

// =====================
// ADMIN ROUTES
// =====================

// GET /api/posts/admin/all - Get all posts for admin
router.get("/admin/all", auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = "createdAt", order = "desc" } = req.query;
    const status = normalizeQueryValue(req.query.status);
    const search = normalizeQueryValue(req.query.search);

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { shortDescription: { $regex: search, $options: "i" } },
      ];
    }

    const sortOrder = order === "asc" ? 1 : -1;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      Post.find(query)
        .populate("category", "name slug")
        .populate("author", "name email")
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit)),
      Post.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        posts: posts.map((post) => ({
          ...post.toObject(),
          id: post._id,
        })),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
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

// GET /api/posts/admin/:id - Get single post for admin (by ID)
router.get("/admin/:id", auth, adminOnly, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("category", "name slug")
      .populate("author", "name email");

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    res.json({
      success: true,
      data: {
        post: {
          ...post.toObject(),
          id: post._id,
        },
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

// POST /api/posts/admin - Create post (admin)
router.post("/admin", auth, adminOnly, async (req, res) => {
  try {
    const payload = pickPostPayload(req.body);

    if (!payload.title) {
      return res.status(400).json({
        success: false,
        message: "Tiêu đề bài viết là bắt buộc",
      });
    }

    if (!payload.content) {
      return res.status(400).json({
        success: false,
        message: "Nội dung bài viết là bắt buộc",
      });
    }

    if (payload.category) {
      if (!mongoose.Types.ObjectId.isValid(payload.category)) {
        return res.status(400).json({
          success: false,
          message: "Danh mục không hợp lệ",
        });
      }
      const existingCategory = await PostCategory.findById(payload.category);
      if (!existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Danh mục không tồn tại",
        });
      }
    }

    if (!payload.slug) {
      payload.slug = await Post.generateSlug(payload.title);
    } else {
      const existingSlug = await Post.findOne({ slug: payload.slug });
      if (existingSlug) {
        return res.status(400).json({
          success: false,
          message: "Slug đã tồn tại, vui lòng chọn slug khác",
        });
      }
    }
    if (!payload.slug) {
      payload.slug = `post-${Date.now()}`;
    }

    payload.author = req.user._id;

    if (payload.status === "published") {
      payload.publishedAt = new Date();
    }

    const post = new Post(payload);
    await post.save();

    await post.populate("category", "name slug");
    await post.populate("author", "name email");

    res.status(201).json({
      success: true,
      message: "Tạo bài viết thành công",
      data: {
        post: {
          ...post.toObject(),
          id: post._id,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Slug đã tồn tại",
      });
    }
    if (error.name === "ValidationError") {
      const firstError = Object.values(error.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: firstError?.message || "Dữ liệu không hợp lệ",
      });
    }
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// PUT /api/posts/admin/:id - Update post (admin)
router.put("/admin/:id", auth, adminOnly, async (req, res) => {
  try {
    const payload = pickPostPayload(req.body);
    const postId = req.params.id;

    const existingPost = await Post.findById(postId);
    if (!existingPost) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    if (payload.slug && payload.slug !== existingPost.slug) {
      const slugExists = await Post.findOne({ slug: payload.slug, _id: { $ne: postId } });
      if (slugExists) {
        return res.status(400).json({
          success: false,
          message: "Slug đã tồn tại, vui lòng chọn slug khác",
        });
      }
    }

    if (payload.category) {
      if (!mongoose.Types.ObjectId.isValid(payload.category)) {
        return res.status(400).json({
          success: false,
          message: "Danh mục không hợp lệ",
        });
      }
      const existingCategory = await PostCategory.findById(payload.category);
      if (!existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Danh mục không tồn tại",
        });
      }
    }

    if (payload.status === "published" && existingPost.status !== "published") {
      payload.publishedAt = new Date();
    }

    const post = await Post.findByIdAndUpdate(postId, payload, {
      new: true,
      runValidators: true,
    })
      .populate("category", "name slug")
      .populate("author", "name email");

    res.json({
      success: true,
      message: "Cập nhật bài viết thành công",
      data: {
        post: {
          ...post.toObject(),
          id: post._id,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Slug đã tồn tại",
      });
    }
    if (error.name === "ValidationError") {
      const firstError = Object.values(error.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: firstError?.message || "Dữ liệu không hợp lệ",
      });
    }
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// DELETE /api/posts/admin/:id - Delete post (admin)
router.delete("/admin/:id", auth, adminOnly, async (req, res) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    res.json({
      success: true,
      message: "Xóa bài viết thành công",
      data: {
        post: {
          ...post.toObject(),
          id: post._id,
        },
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

// PATCH /api/posts/admin/:id/publish - Publish post
router.patch("/admin/:id/publish", auth, adminOnly, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    post.status = "published";
    post.publishedAt = new Date();
    await post.save();

    await post.populate("category", "name slug");
    await post.populate("author", "name email");

    res.json({
      success: true,
      message: "Đã xuất bản bài viết",
      data: {
        post: {
          ...post.toObject(),
          id: post._id,
        },
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

// PATCH /api/posts/admin/:id/unpublish - Unpublish post
router.patch("/admin/:id/unpublish", auth, adminOnly, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bài viết",
      });
    }

    post.status = "draft";
    await post.save();

    await post.populate("category", "name slug");
    await post.populate("author", "name email");

    res.json({
      success: true,
      message: "Đã hủy xuất bản bài viết",
      data: {
        post: {
          ...post.toObject(),
          id: post._id,
        },
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

// =====================
// POST CATEGORIES ADMIN ROUTES
// =====================

// GET /api/posts/admin/categories/all - Get all categories for admin
router.get("/admin/categories/all", auth, adminOnly, async (req, res) => {
  try {
    const categories = await PostCategory.find().sort({ order: 1, name: 1 });

    res.json({
      success: true,
      data: {
        categories: categories.map((cat) => ({
          ...cat.toObject(),
          id: cat._id,
        })),
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

// POST /api/posts/admin/categories - Create category
router.post("/admin/categories", auth, adminOnly, async (req, res) => {
  try {
    const { name, description, isActive, order } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Tên danh mục là bắt buộc",
      });
    }

    const slug = await PostCategory.generateSlug(name);

    const category = new PostCategory({
      name,
      slug,
      description: description || "",
      isActive: isActive !== undefined ? isActive : true,
      order: order || 0,
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: "Tạo danh mục thành công",
      data: {
        category: {
          ...category.toObject(),
          id: category._id,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Slug danh mục đã tồn tại",
      });
    }
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// PUT /api/posts/admin/categories/:id - Update category
router.put("/admin/categories/:id", auth, adminOnly, async (req, res) => {
  try {
    const { name, slug, description, isActive, order } = req.body;
    const categoryId = req.params.id;

    const existingCategory = await PostCategory.findById(categoryId);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy danh mục",
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) {
      const slugExists = await PostCategory.findOne({ slug, _id: { $ne: categoryId } });
      if (slugExists) {
        return res.status(400).json({
          success: false,
          message: "Slug đã tồn tại",
        });
      }
      updateData.slug = slug;
    }
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    const category = await PostCategory.findByIdAndUpdate(categoryId, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      message: "Cập nhật danh mục thành công",
      data: {
        category: {
          ...category.toObject(),
          id: category._id,
        },
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

// DELETE /api/posts/admin/categories/:id - Delete category
router.delete("/admin/categories/:id", auth, adminOnly, async (req, res) => {
  try {
    const postsUsingCategory = await Post.countDocuments({ category: req.params.id });

    if (postsUsingCategory > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa danh mục vì có ${postsUsingCategory} bài viết đang sử dụng`,
      });
    }

    const category = await PostCategory.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy danh mục",
      });
    }

    res.json({
      success: true,
      message: "Xóa danh mục thành công",
      data: {
        category: {
          ...category.toObject(),
          id: category._id,
        },
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

module.exports = router;
