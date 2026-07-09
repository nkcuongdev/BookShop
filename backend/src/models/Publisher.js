const mongoose = require("mongoose");

const publisherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    normalizedKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 220,
      unique: true,
      select: false,
    },
    aliases: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      default: [],
    },
  },
  { timestamps: true }
);

publisherSchema.index({ name: 1, _id: 1 });

module.exports = mongoose.model("Publisher", publisherSchema);
