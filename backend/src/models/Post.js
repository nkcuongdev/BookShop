const mongoose = require("mongoose");
const { parsePositiveInt } = require("../utils/security");

const ALLOWED_SORT_FIELDS = new Set(["publishedAt", "createdAt", "viewCount"]);

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Tiêu đề bài viết là bắt buộc"],
      trim: true,
      maxlength: [200, "Tiêu đề không được quá 200 ký tự"],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      default: "",
    },
    shortDescription: {
      type: String,
      maxlength: [500, "Mô tả ngắn không được quá 500 ký tự"],
      default: "",
    },
    content: {
      type: String,
      required: [true, "Nội dung bài viết là bắt buộc"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostCategory",
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    metaTitle: {
      type: String,
      maxlength: [70, "Meta title không được quá 70 ký tự"],
      default: "",
    },
    metaDescription: {
      type: String,
      maxlength: [160, "Meta description không được quá 160 ký tự"],
      default: "",
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ status: 1, viewCount: -1 });
postSchema.index({ category: 1 });
postSchema.index({ title: "text", shortDescription: "text" });

postSchema.pre("save", function () {
  if (this.isModified("status") && this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

postSchema.statics.generateSlug = async function (title, excludeId = null) {
  let slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  const query = excludeId ? { slug, _id: { $ne: excludeId } } : { slug };
  const existingPost = await this.findOne(query);

  if (existingPost) {
    slug = `${slug}-${Date.now()}`;
  }

  return slug;
};

postSchema.statics.findPublished = function (options = {}) {
  const { category, search, page = 1, limit = 10, sortBy = "publishedAt", order = "desc" } = options;
  const safePage = parsePositiveInt(page, 1, 10_000);
  const safeLimit = parsePositiveInt(limit, 10, 50);
  const safeSortBy = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "publishedAt";

  const query = { status: "published" };

  if (category) {
    query.category = category;
  }

  if (search) query.$text = { $search: String(search).slice(0, 100) };

  const sortOrder = order === "asc" ? 1 : -1;
  const skip = (safePage - 1) * safeLimit;

  return this.find(query)
    .populate("category", "name slug")
    .populate("author", "name")
    .sort({ [safeSortBy]: sortOrder, _id: sortOrder })
    .skip(skip)
    .limit(safeLimit)
    .select("-content");
};

postSchema.statics.countPublished = function (options = {}) {
  const { category, search } = options;
  const query = { status: "published" };

  if (category) {
    query.category = category;
  }

  if (search) query.$text = { $search: String(search).slice(0, 100) };

  return this.countDocuments(query);
};

postSchema.statics.findBySlug = function (slug) {
  return this.findOne({ slug, status: "published" })
    .populate("category", "name slug")
    .populate("author", "name");
};

postSchema.statics.incrementViewCount = function (id) {
  return this.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });
};

postSchema.statics.getRelatedPosts = async function (postId, categoryId, limit = 4) {
  const safeLimit = parsePositiveInt(limit, 4, 20);
  const query = {
    _id: { $ne: postId },
    status: "published",
  };

  if (categoryId) {
    query.category = categoryId;
  }

  return this.find(query)
    .populate("category", "name slug")
    .populate("author", "name")
    .sort({ publishedAt: -1 })
    .limit(safeLimit)
    .select("-content");
};

postSchema.statics.getLatestPosts = function (limit = 5) {
  const safeLimit = parsePositiveInt(limit, 5, 20);
  return this.find({ status: "published" })
    .populate("category", "name slug")
    .populate("author", "name")
    .sort({ publishedAt: -1 })
    .limit(safeLimit)
    .select("-content");
};

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
