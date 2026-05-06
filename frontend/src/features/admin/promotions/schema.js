import { z } from "zod";

export const promotionSchema = z
  .object({
    name: z.string().min(2, "Tên tối thiểu 2 ký tự"),
    description: z.string().optional().default(""),
    type: z.enum(["percent", "fixed"]),
    value: z.coerce.number().min(0, "Giá trị không hợp lệ"),
    startDate: z.string().min(1, "Chọn ngày bắt đầu"),
    endDate: z.string().min(1, "Chọn ngày kết thúc"),
    scope: z.enum(["products", "category"]),
    books: z.array(z.string()).default([]),
    category: z.string().default(""),
    active: z.boolean().default(true),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["endDate"],
  })
  .refine((d) => (d.type === "percent" ? d.value > 0 && d.value <= 100 : true), {
    message: "Phần trăm phải trong khoảng 1-100",
    path: ["value"],
  })
  .refine(
    (d) => (d.scope === "products" ? (d.books?.length || 0) > 0 : true),
    {
      message: "Chọn ít nhất một sản phẩm",
      path: ["books"],
    }
  )
  .refine((d) => (d.scope === "category" ? !!d.category : true), {
    message: "Chọn danh mục áp dụng",
    path: ["category"],
  });

export const promotionDefaults = {
  name: "",
  description: "",
  type: "percent",
  value: 10,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10),
  scope: "products",
  books: [],
  category: "",
  active: true,
};

export function promotionStatus(p) {
  if (p.status) return p.status;
  const now = new Date();
  const start = new Date(p.startDate);
  const end = new Date(p.endDate);
  if (!p.active) return "inactive";
  if (start > now) return "upcoming";
  if (end < now) return "expired";
  return "active";
}
