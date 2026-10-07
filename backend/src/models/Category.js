const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 100,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    description: { type: String, default: "", trim: true, maxlength: 2_000 },
    image: { type: String, default: "", trim: true, maxlength: 2_048 },
    // Key of the storefront icon chosen in the admin form (e.g. "feather").
    // The icon set lives in the frontend; an unknown or empty key falls back
    // to an icon guessed from the name, so only the shape is checked here.
    icon: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 40,
      match: /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/,
    },
    // Write-only mutex shared by category deletion and book writes. It has no
    // business meaning; touching it makes concurrent reference changes
    // serialize on the same MongoDB document.
    integrityGuardAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
