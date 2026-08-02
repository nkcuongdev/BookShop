const express = require("express");
const mongoose = require("mongoose");
const Book = require("../models/Book");
const Supplier = require("../models/Supplier");
const { getSupplierSummary } = require("../services/stockReceiptService");
const { auth, requirePermission } = require("../middleware/auth");
const { parsePositiveInt } = require("../utils/security");

const router = express.Router();

router.use(auth, requirePermission("supplier.read"));

const WRITABLE_FIELDS = [
  "code",
  "name",
  "taxCode",
  "phone",
  "email",
  "website",
  "address",
  "contactPerson",
  "paymentTerms",
  "leadTimeDays",
  "status",
  "note",
];

const serialize = (supplier) => ({
  ...(supplier.toObject ? supplier.toObject() : supplier),
  id: supplier._id,
});

function normalizePayload(body = {}) {
  const payload = {};
  for (const field of WRITABLE_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  if (payload.code !== undefined) {
    payload.code = String(payload.code).trim().toUpperCase();
  }
  if (payload.name !== undefined) payload.name = String(payload.name).trim();
  if (payload.leadTimeDays !== undefined) {
    const days = Number(payload.leadTimeDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      const error = new Error("Thời gian giao hàng phải từ 0 đến 365 ngày");
      error.status = 400;
      throw error;
    }
    payload.leadTimeDays = days;
  }
  if (payload.paymentTerms !== undefined && !Supplier.PAYMENT_TERMS.includes(payload.paymentTerms)) {
    const error = new Error("Điều khoản thanh toán không hợp lệ");
    error.status = 400;
    throw error;
  }
  return payload;
}

function sendSupplierError(res, error) {
  const duplicate = error?.code === 11000;
  const status = duplicate ? 409 : error?.status || 400;
  return res.status(status).json({
    success: false,
    message: duplicate ? "Mã nhà cung cấp đã tồn tại" : error.message,
  });
}

// GET /api/admin/suppliers
router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = Supplier.search(req.query);

    const [suppliers, total] = await Promise.all([
      Supplier.find(filter)
        .sort({ status: 1, name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Supplier.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        suppliers: suppliers.map(serialize),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// GET /api/admin/suppliers/:id - detail plus purchasing summary
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhà cung cấp" });
    }
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhà cung cấp" });
    }
    const [summaryRow] = await getSupplierSummary(req.params.id);
    const bookCount = await Book.countDocuments({ defaultSupplier: supplier._id });

    return res.json({
      success: true,
      data: {
        supplier: serialize(supplier),
        summary: {
          receipts: summaryRow?.receipts || 0,
          totalUnits: summaryRow?.totalUnits || 0,
          totalAmount: summaryRow?.totalAmount || 0,
          lastReceivedAt: summaryRow?.lastReceivedAt || null,
          bookCount,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// GET /api/admin/suppliers/:id/books - catalogue sourced from this supplier
router.get("/:id/books", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhà cung cấp" });
    }
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = { defaultSupplier: req.params.id };

    const [books, total] = await Promise.all([
      Book.find(filter)
        .select("title author imageUrl isbn stock price costPrice reorderPoint status")
        .sort({ title: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Book.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        books,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// POST /api/admin/suppliers
router.post("/", requirePermission("supplier.write"), async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});
    for (const field of ["code", "name"]) {
      if (!payload[field]) {
        return res.status(400).json({ success: false, message: `Thiếu trường: ${field}` });
      }
    }
    const supplier = await Supplier.create(payload);
    return res.status(201).json({
      success: true,
      message: "Đã tạo nhà cung cấp",
      data: { supplier: serialize(supplier) },
    });
  } catch (error) {
    return sendSupplierError(res, error);
  }
});

// PUT /api/admin/suppliers/:id
router.put("/:id", requirePermission("supplier.write"), async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhà cung cấp" });
    }
    Object.assign(supplier, normalizePayload(req.body || {}));
    await supplier.save();
    return res.json({
      success: true,
      message: "Đã cập nhật nhà cung cấp",
      data: { supplier: serialize(supplier) },
    });
  } catch (error) {
    return sendSupplierError(res, error);
  }
});

// PATCH /api/admin/suppliers/:id/toggle
router.patch("/:id/toggle", requirePermission("supplier.write"), async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhà cung cấp" });
    }
    supplier.status = supplier.status === "active" ? "inactive" : "active";
    await supplier.save();
    return res.json({ success: true, data: { supplier: serialize(supplier) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// DELETE /api/admin/suppliers/:id
// Suppliers referenced by goods receipts are deactivated rather than removed so
// purchase history keeps its counterparty.
router.delete("/:id", requirePermission("supplier.write"), async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhà cung cấp" });
    }
    const [summaryRow] = await getSupplierSummary(req.params.id);
    if (summaryRow?.receipts) {
      return res.status(409).json({
        success: false,
        message:
          "Nhà cung cấp đã có phiếu nhập nên không thể xoá. Hãy chuyển sang trạng thái ngừng hoạt động.",
        code: "SUPPLIER_IN_USE",
      });
    }
    await Book.updateMany(
      { defaultSupplier: supplier._id },
      { $set: { defaultSupplier: null } }
    );
    await supplier.deleteOne();
    return res.json({ success: true, message: "Đã xoá nhà cung cấp" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

module.exports = router;
