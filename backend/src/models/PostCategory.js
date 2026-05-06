const mongoose = require("mongoose");

const postCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên danh mục là bắt buộc"],
      trim: true,
      maxlength: [100, "Tên danh mục không được quá 100 ký tự"],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: [500, "Mô tả không được quá 500 ký tự"],
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

postCategorySchema.index({ slug: 1 });
postCategorySchema.index({ isActive: 1, order: 1 });

postCategorySchema.statics.generateSlug = async function (name, excludeId = null) {
  let slug = name
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
  const existing = await this.findOne(query);

  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  return slug;
};

postCategorySchema.statics.getActiveCategories = function () {
  return this.find({ isActive: true }).sort({ order: 1, name: 1 });
};

postCategorySchema.virtual("postCount", {
  ref: "Post",
  localField: "_id",
  foreignField: "category",
  count: true,
});

const PostCategory = mongoose.model("PostCategory", postCategorySchema);

module.exports = PostCategory;
