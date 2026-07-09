const Category = require("../models/Category");
const mongoose = require("mongoose");
const {
  ALLOWED_REMOTE_IMAGE_ORIGINS,
  isAllowedBookImageUrl,
} = require("../utils/imageUrlPolicy");
const { isValidIsbn, normalizeIsbn } = require("../utils/bookMetadata");

const ALLOWED_BOOK_FIELDS = [
  "title",
  "author",
  "contributors",
  "description",
  "price",
  "imageUrl",
  "category",
  "stock",
  "status",
  "publisher",
  "editionGroup",
  "edition",
  "publishedDate",
  "isbn",
  "pages",
  "language",
  "weight",
  "dimensions",
  "tags",
  "gallery",
  "attributes",
  // Inventory settings. `costPrice` is deliberately absent: it is derived from
  // confirmed goods receipts, never typed in directly.
  "reorderPoint",
  "reorderQuantity",
  "defaultSupplier",
];

// Once a book exists, its stock is owned by the inventory ledger. Editing the
// field directly would desynchronise Book.stock from StockLedger, so updates
// have to go through a goods receipt, an issue, a stocktake or an adjustment.
const STOCK_LOCKED_ON_UPDATE = "stock";

function stockNotEditableError() {
  const error = new Error(
    "Không thể sửa tồn kho trực tiếp. Dùng phiếu nhập, phiếu xuất, " +
      "kiểm kho hoặc điều chỉnh tồn để thay đổi số lượng."
  );
  error.statusCode = 400;
  error.code = "STOCK_NOT_DIRECTLY_EDITABLE";
  return error;
}

function normalizeImageUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  if (candidate.length > 2_048) return null;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!isAllowedBookImageUrl(parsed.toString())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function invalidImageUrlError() {
  const error = new Error(
    "URL ảnh phải thuộc kho ảnh của BookShop hoặc nguồn ảnh được cho phép: " +
      `${ALLOWED_REMOTE_IMAGE_ORIGINS.join(", ")}. ` +
      "Thêm nguồn khác qua biến môi trường ALLOWED_IMAGE_ORIGINS."
  );
  error.statusCode = 400;
  return error;
}

function payloadLimitError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = "BOOK_PAYLOAD_LIMIT_EXCEEDED";
  return error;
}

function pickBookPayload(body = {}, { mode = "create" } = {}) {
  const payload = {};
  for (const key of ALLOWED_BOOK_FIELDS) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  if (mode === "update" && payload[STOCK_LOCKED_ON_UPDATE] !== undefined) {
    throw stockNotEditableError();
  }
  for (const key of ["reorderPoint", "reorderQuantity"]) {
    if (payload[key] === undefined) continue;
    const parsed = Number(payload[key]);
    if (!Number.isInteger(parsed) || parsed < 0) {
      const error = new Error("Ngưỡng tồn kho phải là số nguyên không âm");
      error.statusCode = 400;
      throw error;
    }
    payload[key] = parsed;
  }
  if (payload.defaultSupplier === "" || payload.defaultSupplier === null) {
    payload.defaultSupplier = null;
  }
  if (Array.isArray(payload.attributes)) {
    if (payload.attributes.length > 30) {
      throw payloadLimitError("Sách chỉ được có tối đa 30 thuộc tính");
    }
    payload.attributes = payload.attributes
      .map((attribute) => ({
        key: String(attribute?.key || "").trim(),
        value: String(attribute?.value ?? ""),
      }))
      .filter((attribute) => attribute.key);
  }
  if (payload.contributors !== undefined) {
    if (!Array.isArray(payload.contributors) || payload.contributors.length > 20) {
      throw payloadLimitError("Sách chỉ được có tối đa 20 người đóng góp");
    }
    const roles = new Set(["author", "translator", "editor", "illustrator"]);
    payload.contributors = payload.contributors
      .map((entry) => ({
        name: String(entry?.name || "").trim().replace(/\s+/g, " "),
        role: String(entry?.role || "author").trim().toLowerCase(),
      }))
      .filter((entry) => entry.name);
    if (
      payload.contributors.some(
        (entry) => entry.name.length > 200 || !roles.has(entry.role)
      )
    ) {
      const error = new Error("Thông tin tác giả/người đóng góp không hợp lệ");
      error.statusCode = 422;
      throw error;
    }
  }
  if (Array.isArray(payload.tags)) {
    if (payload.tags.length > 20) {
      throw payloadLimitError("Sách chỉ được có tối đa 20 thẻ");
    }
    payload.tags = [...new Set(payload.tags.map((tag) => String(tag).trim()).filter(Boolean))];
  }
  if (Array.isArray(payload.gallery)) {
    if (payload.gallery.length > 10) {
      throw payloadLimitError("Bộ sưu tập chỉ được có tối đa 10 ảnh");
    }
    const submitted = payload.gallery.filter(Boolean);
    payload.gallery = submitted.map(normalizeImageUrl).filter(Boolean);
    if (payload.gallery.length !== submitted.length) {
      throw invalidImageUrlError();
    }
  }
  if (payload.imageUrl !== undefined) {
    payload.imageUrl = normalizeImageUrl(payload.imageUrl);
    if (payload.imageUrl === null) throw invalidImageUrlError();
  }
  for (const key of ["pages", "weight"]) {
    if (payload[key] === "" || payload[key] === null) payload[key] = null;
  }
  if (payload.publishedDate === "" || payload.publishedDate === null) {
    payload.publishedDate = null;
  }
  if (payload.isbn !== undefined) {
    payload.isbn = normalizeIsbn(payload.isbn);
    if (!isValidIsbn(payload.isbn)) {
      const error = new Error("ISBN không hợp lệ (sai độ dài hoặc check digit)");
      error.statusCode = 422;
      error.code = "INVALID_ISBN";
      throw error;
    }
  }
  if (payload.editionGroup === "" || payload.editionGroup === null) {
    payload.editionGroup = null;
  } else if (
    payload.editionGroup !== undefined &&
    !mongoose.isValidObjectId(payload.editionGroup)
  ) {
    const error = new Error("Mã nhóm ấn bản không hợp lệ");
    error.statusCode = 422;
    error.code = "INVALID_EDITION_GROUP";
    throw error;
  }
  if (payload.edition !== undefined) {
    const number = Number(payload.edition?.number || 1);
    const format = String(payload.edition?.format || "paperback").toLowerCase();
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      !["paperback", "hardcover", "ebook", "audiobook", "other"].includes(format)
    ) {
      const error = new Error("Thông tin ấn bản không hợp lệ");
      error.statusCode = 422;
      throw error;
    }
    payload.edition = {
      number,
      format,
      label: String(payload.edition?.label || "").trim().slice(0, 100),
    };
  }
  return payload;
}

function validateRequiredBookFields(payload = {}) {
  const missing = [];
  if (!String(payload.title || "").trim()) missing.push("tên sách");
  if (!String(payload.author || "").trim()) missing.push("tác giả");
  if (
    payload.price === undefined ||
    payload.price === null ||
    String(payload.price).trim() === ""
  ) {
    missing.push("giá bán");
  }
  if (
    payload.stock === undefined ||
    payload.stock === null ||
    String(payload.stock).trim() === ""
  ) {
    missing.push("tồn kho");
  }
  if (!String(payload.category || "").trim()) missing.push("danh mục");
  if (!String(payload.imageUrl || "").trim()) missing.push("ảnh bìa");

  if (missing.length) {
    const error = new Error(`Vui lòng nhập: ${missing.join(", ")}`);
    error.statusCode = 400;
    error.code = "BOOK_REQUIRED_FIELDS_MISSING";
    throw error;
  }
}

async function normalizeBookCategory(payload, { session = null, lock = false } = {}) {
  if (payload.category === undefined) return true;
  const slug = String(payload.category || "").trim().toLowerCase();
  if (!slug) return false;
  const category = lock
    ? await Category.findOneAndUpdate(
        { slug },
        { $set: { integrityGuardAt: new Date() } },
        { returnDocument: "after", session }
      ).select("slug")
    : await Category.findOne({ slug }).select("slug").session(session);
  if (!category) return false;
  payload.category = category.slug;
  return true;
}

module.exports = {
  normalizeBookCategory,
  pickBookPayload,
  stockNotEditableError,
  validateRequiredBookFields,
};
