const mongoose = require("mongoose");
const { safeRegex } = require("../utils/security");

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

postSchema.index({ slug: 1 });
postSchema.index({ status: 1, publishedAt: -1 });
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

  const query = { status: "published" };

  if (category) {
    query.category = category;
  }

  if (search) {
    const regex = safeRegex(search);
    if (regex) {
    query.$or = [
      { title: regex },
      { shortDescription: regex },
    ];
    }
  }

  const sortOrder = order === "asc" ? 1 : -1;
  const skip = (page - 1) * limit;

  return this.find(query)
    .populate("category", "name slug")
    .populate("author", "name")
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .select("-content");
};

postSchema.statics.countPublished = function (options = {}) {
  const { category, search } = options;
  const query = { status: "published" };

  if (category) {
    query.category = category;
  }

  if (search) {
    const regex = safeRegex(search);
    if (regex) {
    query.$or = [
      { title: regex },
      { shortDescription: regex },
    ];
    }
  }

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
    .limit(limit)
    .select("-content");
};

postSchema.statics.getLatestPosts = function (limit = 5) {
  return this.find({ status: "published" })
    .populate("category", "name slug")
    .populate("author", "name")
    .sort({ publishedAt: -1 })
    .limit(limit)
    .select("-content");
};

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
