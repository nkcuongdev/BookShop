const express = require("express");
const Voucher = require("../models/Voucher");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(auth, adminOnly);

const serialize = (v) => ({ ...v.toObject(), id: v._id });

// GET /api/admin/vouchers
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const vouchers = search
      ? await Voucher.search(search)
      : await Voucher.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { vouchers: vouchers.map(serialize) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// POST /api/admin/vouchers
router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};
    const required = ["code", "type", "value", "startAt", "endAt", "usageLimit"];
    for (const key of required) {
      if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
        return res.status(400).json({
          success: false,
          message: `Thiếu trường: ${key}`,
        });
      }
    }

    const exists = await Voucher.findOne({ code: payload.code.toUpperCase() });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Mã voucher đã tồn tại",
      });
    }

    const voucher = await Voucher.create(payload);
    res.status(201).json({
      success: true,
      message: "Đã tạo voucher",
      data: { voucher: serialize(voucher) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PUT /api/admin/vouchers/:id
router.put("/:id", async (req, res) => {
  try {
    const { usedCount, ...data } = req.body || {};
    const voucher = await Voucher.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!voucher) {
      return res.status(404).json({ success: false, message: "Không tìm thấy voucher" });
    }
    res.json({
      success: true,
      message: "Đã cập nhật voucher",
      data: { voucher: serialize(voucher) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PATCH /api/admin/vouchers/:id/toggle
router.patch("/:id/toggle", async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ success: false, message: "Không tìm thấy voucher" });
    }
    voucher.active = !voucher.active;
    await voucher.save();
    res.json({
      success: true,
      data: { voucher: serialize(voucher) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// DELETE /api/admin/vouchers/:id
router.delete("/:id", async (req, res) => {
  try {
    const voucher = await Voucher.findByIdAndDelete(req.params.id);
    if (!voucher) {
      return res.status(404).json({ success: false, message: "Không tìm thấy voucher" });
    }
    res.json({ success: true, message: "Đã xoá voucher" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

module.exports = router;
