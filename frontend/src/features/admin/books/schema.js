import { z } from "zod";

const requiredImageUrl = z
  .string()
  .trim()
  .min(1, "Vui lòng tải ảnh bìa")
  .refine(
    (v) => v.startsWith("data:") || /^https?:\/\//.test(v),
    "URL ảnh không hợp lệ"
  );

const requiredPrice = z
  .union([
    z.number(),
    z.string().trim().min(1, "Vui lòng nhập giá bán"),
  ])
  .pipe(
    z.coerce
      .number({ error: "Giá phải là số" })
      .int("Giá phải là số nguyên")
      .min(0, "Giá không hợp lệ")
  );

const requiredStock = z
  .union([
    z.number(),
    z.string().trim().min(1, "Vui lòng nhập tồn kho"),
  ])
  .pipe(
    z.coerce
      .number({ error: "Tồn kho phải là số" })
      .int("Tồn kho phải là số nguyên")
      .min(0, "Tồn kho không hợp lệ")
  );

// Reorder thresholds default to 0, which the server reads as "use the system
// default", so an empty box is a valid answer rather than a missing one.
const reorderInt = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  })
  .refine((v) => v >= 0, "Giá trị không được âm");

const optionalInt = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  })
  .refine((v) => v === null || v >= 0, "Giá trị không hợp lệ");

const optionalNumber = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })
  .refine((v) => v === null || v >= 0, "Giá trị không hợp lệ");

const currentYear = new Date().getFullYear();

function normalizeIsbn(value) {
  return String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
}

function validIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (!isbn) return true;
  if (/^\d{9}[\dX]$/.test(isbn)) {
    return [...isbn].reduce((sum, character, index) =>
      sum + (character === "X" ? 10 : Number(character)) * (10 - index), 0) % 11 === 0;
  }
  if (!/^\d{13}$/.test(isbn)) return false;
  const sum = isbn.slice(0, 12).split("").reduce(
    (total, character, index) => total + Number(character) * (index % 2 ? 3 : 1),
    0
  );
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

const optionalYear = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined ? "" : String(v).trim()))
  .refine(
    (v) =>
      !v ||
      (/^\d{4}$/.test(v) && Number(v) >= 1000 && Number(v) <= currentYear),
    `Năm xuất bản phải từ 1000 đến ${currentYear}`
  );

export function publishedDateToYear(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : String(date.getUTCFullYear());
}

export function publishedYearToDate(value) {
  return value ? `${value}-01-01T00:00:00.000Z` : null;
}

const bookBaseSchema = z.object({
  // Core
  title: z.string().min(1, "Vui lòng nhập tên sách"),
  author: z.string().min(1, "Vui lòng nhập tác giả"),
  contributors: z.array(z.object({
    name: z.string().trim().min(1, "Vui lòng nhập tên"),
    role: z.enum(["author", "translator", "editor", "illustrator"]),
  })).max(20).optional().default([]),
  price: requiredPrice,
  stock: requiredStock,
  categoryId: z.string().min(1, "Vui lòng chọn danh mục"),
  description: z.string().optional().default(""),
  imageUrl: requiredImageUrl,
  status: z.enum(["active", "inactive"]).default("active"),

  // Publishing (optional)
  publisher: z.string().optional().default(""),
  publishedYear: optionalYear,
  isbn: z.string().optional().default("").refine(validIsbn, "ISBN không hợp lệ"),
  editionGroup: z
    .string()
    .trim()
    .refine((value) => !value || /^[0-9a-fA-F]{24}$/.test(value), "Mã nhóm ấn bản không hợp lệ")
    .optional()
    .default(""),
  edition: z.object({
    number: z.coerce.number().int().min(1, "Số ấn bản phải từ 1"),
    label: z.string().trim().max(100).optional().default(""),
    format: z.enum(["paperback", "hardcover", "ebook", "audiobook", "other"]),
  }).default({ number: 1, label: "", format: "paperback" }),
  pages: optionalInt,
  language: z.string().optional().default(""),

  // Physical specs (optional)
  weight: optionalNumber,
  dimensions: z
    .object({
      length: optionalNumber,
      width: optionalNumber,
      height: optionalNumber,
    })
    .default({ length: null, width: null, height: null }),

  // Inventory settings. `costPrice` is absent on purpose: it is derived from
  // confirmed goods receipts, never typed in here.
  reorderPoint: reorderInt,
  reorderQuantity: reorderInt,
  defaultSupplier: z.string().optional().default(""),

  // Taxonomy / media
  tags: z.array(z.string()).optional().default([]),
  gallery: z.array(z.string()).optional().default([]),

  // Custom attributes
  attributes: z
    .array(
      z.object({
        key: z.string().optional().default(""),
        value: z.string().optional().default(""),
      })
    )
    .optional()
    .default([]),
});

/**
 * Creating a book sets its opening stock. Editing one cannot: stock is owned by
 * the inventory ledger from then on, and the server rejects the field outright,
 * so the edit form must not collect or send it.
 */
export const bookCreateSchema = bookBaseSchema;
export const bookEditSchema = bookBaseSchema.omit({ stock: true });
// Kept as an alias for callers that predate the create/edit split.
export const bookSchema = bookCreateSchema;

export function bookSchemaFor(mode) {
  return mode === "edit" ? bookEditSchema : bookCreateSchema;
}

export const bookDefaults = {
  title: "",
  author: "",
  contributors: [],
  price: "",
  stock: "",
  categoryId: "",
  description: "",
  imageUrl: "",
  status: "active",

  publisher: "",
  publishedYear: "",
  isbn: "",
  editionGroup: "",
  edition: { number: 1, label: "", format: "paperback" },
  pages: null,
  language: "",

  weight: null,
  dimensions: { length: null, width: null, height: null },

  reorderPoint: 0,
  reorderQuantity: 0,
  defaultSupplier: "",

  tags: [],
  gallery: [],
  attributes: [],
};
