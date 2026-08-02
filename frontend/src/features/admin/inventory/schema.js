import { z } from "zod";

const lineItem = z.object({
  book: z.string().min(1, "Chọn sách"),
  title: z.string().default(""),
  quantity: z.coerce
    .number()
    .int("Số lượng phải là số nguyên")
    .positive("Số lượng phải lớn hơn 0"),
  unitCost: z.coerce.number().min(0, "Giá không được âm").default(0),
  note: z.string().max(300).default(""),
});

/** Duplicate books on one document would double-count; catch it before posting. */
function noDuplicateBooks(items, ctx) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (seen.has(item.book)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sách bị trùng, hãy gộp thành một dòng",
        path: [index, "book"],
      });
    }
    seen.add(item.book);
  });
}

export const stockReceiptSchema = z.object({
  supplier: z.string().min(1, "Chọn nhà cung cấp"),
  invoiceNumber: z.string().max(100).default(""),
  invoiceDate: z.string().default(""),
  receivedAt: z.string().default(""),
  discount: z.coerce.number().min(0, "Chiết khấu không được âm").default(0),
  shippingFee: z.coerce.number().min(0, "Phí vận chuyển không được âm").default(0),
  note: z.string().max(1000).default(""),
  items: z
    .array(lineItem)
    .min(1, "Phiếu nhập phải có ít nhất một dòng")
    .superRefine(noDuplicateBooks),
});

export const stockReceiptDefaults = {
  supplier: "",
  invoiceNumber: "",
  invoiceDate: "",
  receivedAt: new Date().toISOString().slice(0, 10),
  discount: 0,
  shippingFee: 0,
  note: "",
  items: [],
};

export const stockIssueSchema = z
  .object({
    type: z.enum([
      "DAMAGED",
      "LOST",
      "GIFT",
      "SAMPLE",
      "RETURN_SUPPLIER",
      "OTHER",
    ]),
    reason: z
      .string()
      .min(1, "Vui lòng nhập lý do xuất kho")
      .max(500, "Lý do tối đa 500 ký tự"),
    supplier: z.string().default(""),
    issuedAt: z.string().default(""),
    note: z.string().max(1000).default(""),
    items: z
      .array(lineItem.omit({ unitCost: true }))
      .min(1, "Phiếu xuất phải có ít nhất một dòng")
      .superRefine(noDuplicateBooks),
  })
  .refine((data) => data.type !== "RETURN_SUPPLIER" || Boolean(data.supplier), {
    message: "Trả hàng nhà cung cấp cần chọn nhà cung cấp",
    path: ["supplier"],
  });

export const stockIssueDefaults = {
  type: "DAMAGED",
  reason: "",
  supplier: "",
  issuedAt: new Date().toISOString().slice(0, 10),
  note: "",
  items: [],
};

export const stockCountSchema = z
  .object({
    scope: z.enum(["ALL", "CATEGORY"]),
    scopeValue: z.string().default(""),
    note: z.string().max(1000).default(""),
  })
  .refine((data) => data.scope !== "CATEGORY" || Boolean(data.scopeValue), {
    message: "Chọn danh mục cần kiểm",
    path: ["scopeValue"],
  });

export const stockCountDefaults = {
  scope: "ALL",
  scopeValue: "",
  note: "",
};

export const stockAdjustSchema = z.object({
  bookId: z.string().min(1, "Chọn sách"),
  quantity: z.coerce
    .number()
    .int("Số lượng phải là số nguyên")
    .refine((value) => value !== 0, "Số lượng phải khác 0"),
  reason: z
    .string()
    .min(1, "Điều chỉnh tồn kho bắt buộc có lý do")
    .max(500, "Lý do tối đa 500 ký tự"),
});

/** Mirrors the server-side total so the form previews the same figure. */
export function receiptTotals(items = [], discount = 0, shippingFee = 0) {
  const subtotal = items.reduce(
    (total, item) =>
      total + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0),
    0
  );
  return {
    subtotal,
    totalAmount: Math.max(
      0,
      subtotal - (Number(discount) || 0) + (Number(shippingFee) || 0)
    ),
  };
}
