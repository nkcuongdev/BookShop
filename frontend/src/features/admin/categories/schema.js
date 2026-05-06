import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên danh mục"),
  slug: z
    .string()
    .min(1, "Vui lòng nhập slug")
    .regex(/^[a-z0-9-]+$/, "Slug chỉ chứa chữ thường, số, dấu gạch"),
  description: z.string().optional().default(""),
  image: z.string().optional().default(""),
});

export function generateSlug(name = "") {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}
