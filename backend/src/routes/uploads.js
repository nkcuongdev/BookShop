const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const { auth, requirePermission } = require("../middleware/auth");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const { storeImage, deleteImage } = require("../services/imageStorage");
const { registerUploadedAsset } = require("../services/assetLifecycleService");
const { getReturnEligibility } = require("../services/returnRequestService");
const { createRateLimiter } = require("../utils/security");

const reviewUploadRouter = express.Router();
const adminUploadRouter = express.Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});
const reviewUploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyPrefix: "review-image-upload",
  message: "Bạn đã tải ảnh quá nhiều lần, vui lòng thử lại sau",
});
const returnUploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyPrefix: "return-image-upload",
  message: "Bạn đã tải ảnh quá nhiều lần, vui lòng thử lại sau",
});
const ADMIN_IMAGE_PURPOSES = new Set(["book", "category", "post"]);

function receiveSingleImage(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Ảnh không được vượt quá 5 MB",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Trường tải ảnh không hợp lệ, phải dùng trường 'image'",
      });
    }
    console.error("Upload error:", error.code || error.name, error.message);
    return res.status(400).json({ success: false, message: "File upload không hợp lệ" });
  });
}

function storeUploadedImage(purpose) {
  return async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, message: "Vui lòng chọn ảnh" });
      }
      const image = await storeImage(req.file.buffer);
      const resolvedPurpose =
        typeof purpose === "function" ? purpose(req) : purpose;
      try {
        await registerUploadedAsset(image, req.user._id, resolvedPurpose);
      } catch (error) {
        await deleteImage(image.assetId).catch(() => {});
        throw error;
      }
      return res.status(201).json({ success: true, data: { image } });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : "Không thể lưu ảnh",
      });
    }
  };
}

reviewUploadRouter.post(
  "/review-images",
  auth,
  reviewUploadLimiter,
  async (req, res, next) => {
    try {
      const bookId = String(req.query.bookId || "");
      if (!mongoose.isValidObjectId(bookId)) {
        return res.status(400).json({ success: false, message: "Mã sách không hợp lệ" });
      }
      if (!(await Order.hasUserPurchasedBook(req.user._id, bookId))) {
        return res.status(403).json({
          success: false,
          message: "Bạn chỉ có thể tải ảnh cho sách đã mua và đã giao",
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  },
  receiveSingleImage,
  storeUploadedImage("review")
);

reviewUploadRouter.post(
  "/support-ticket-images",
  auth,
  returnUploadLimiter,
  async (req, res, next) => {
    try {
      const orderId = String(req.query.orderId || "");
      if (!mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({ success: false, message: "Mã đơn hàng không hợp lệ" });
      }
      const ownsOrder = await Order.exists({ _id: orderId, user: req.user._id });
      if (!ownsOrder) {
        return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  },
  receiveSingleImage,
  storeUploadedImage("support_ticket")
);

reviewUploadRouter.post(
  "/return-images",
  auth,
  returnUploadLimiter,
  async (req, res, next) => {
    try {
      const orderId = String(req.query.orderId || "");
      if (!mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({ success: false, message: "Mã đơn hàng không hợp lệ" });
      }
      const order = await Order.findOne({ _id: orderId, user: req.user._id });
      if (!order) {
        return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
      }
      const existingRequests = await ReturnRequest.find({ order: order._id })
        .select("status items")
        .lean();
      const eligibility = getReturnEligibility(order, existingRequests);
      if (!eligibility.eligible) {
        return res.status(eligibility.code === "ALREADY_REQUESTED" ? 409 : 422).json({
          success: false,
          message: "Đơn hàng hiện không đủ điều kiện tải ảnh đổi trả",
          code: eligibility.code,
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  },
  receiveSingleImage,
  storeUploadedImage("return_request")
);

adminUploadRouter.post(
  "/images",
  auth,
  requirePermission("upload.admin"),
  (req, res, next) => {
    const purpose = String(req.query.purpose || "book").trim();
    if (!ADMIN_IMAGE_PURPOSES.has(purpose)) {
      return res.status(400).json({
        success: false,
        message: "Mục đích tải ảnh không hợp lệ",
      });
    }
    req.imagePurpose = purpose;
    return next();
  },
  receiveSingleImage,
  storeUploadedImage((req) => req.imagePurpose)
);

module.exports = { adminUploadRouter, reviewUploadRouter };
