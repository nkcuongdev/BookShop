const mongoose = require("mongoose");

const reviewReportSchema = new mongoose.Schema(
  {
    review: { type: mongoose.Schema.Types.ObjectId, ref: "Review", required: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: {
      type: String,
      enum: ["spam", "abuse", "off_topic", "other"],
      required: true,
    },
    details: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

reviewReportSchema.index({ review: 1, reporter: 1 }, { unique: true });
reviewReportSchema.index({ review: 1, createdAt: -1 });

module.exports = mongoose.model("ReviewReport", reviewReportSchema);
