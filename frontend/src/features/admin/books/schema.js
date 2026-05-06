import { z } from "zod";

const urlOrEmpty = z
  .string()
  .optional()
  .default("")
  .refine(
    (v) => !v || v.startsWith("data:") || /^https?:\/\//.test(v),
    "URL ảnh không hợp lệ"
  );

const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  })
  .refine((v) => v === null || v >= 0, "Giá trị không hợp lệ");

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })
  .refine((v) => v === null || v >= 0, "Giá trị không hợp lệ");

const optionalDate = z
  .string()
  .optional()
  .default("")
  .refine(
    (v) => !v || !Number.isNaN(new Date(v).getTime()),
    "Ngày không hợp lệ"
  );

export const bookSchema = z.object({
  // Core
  title: z.string().min(1, "Vui lòng nhập tên sách"),
  author: z.string().min(1, "Vui lòng nhập tác giả"),
  price: z.coerce.number().int("Giá phải là số nguyên").min(0, "Giá không hợp lệ"),
  stock: z.coerce.number().int("Tồn kho phải là số nguyên").min(0, "Tồn kho không hợp lệ"),
  categoryId: z.string().min(1, "Vui lòng chọn danh mục"),
  description: z.string().optional().default(""),
  imageUrl: urlOrEmpty,
  status: z.enum(["active", "inactive"]).default("active"),

  // Publishing (optional)
  publisher: z.string().optional().default(""),
  publishedDate: optionalDate,
  isbn: z.string().optional().default(""),
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

export const bookDefaults = {
  title: "",
  author: "",
  price: 0,
  stock: 0,
  categoryId: "",
  description: "",
  imageUrl: "",
  status: "active",

  publisher: "",
  publishedDate: "",
  isbn: "",
  pages: null,
  language: "",

  weight: null,
  dimensions: { length: null, width: null, height: null },

  tags: [],
  gallery: [],
  attributes: [],
};
