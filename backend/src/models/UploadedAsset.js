const mongoose = require("mongoose");

const uploadedAssetSchema = new mongoose.Schema(
  {
    assetId: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, unique: true },
    provider: {
      type: String,
      enum: ["local", "cloudinary"],
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["temporary", "attached", "pending_delete", "deleting"],
      default: "temporary",
      index: true,
    },
    purpose: {
      type: String,
      enum: ["book", "category", "post", "review", "return_request", "support_ticket"],
      default: "book",
      index: true,
    },
    entityType: {
      type: String,
      enum: ["book", "category", "post", "review", "return_request", "support_ticket"],
      default: null,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    expiresAt: { type: Date, required: true, index: true },
    nextRetryAt: { type: Date, default: null, index: true },
    lockedUntil: { type: Date, default: null },
    retryCount: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

uploadedAssetSchema.index({ provider: 1, assetId: 1 }, { unique: true });
uploadedAssetSchema.index({ status: 1, expiresAt: 1, nextRetryAt: 1 });

module.exports = mongoose.model("UploadedAsset", uploadedAssetSchema);
