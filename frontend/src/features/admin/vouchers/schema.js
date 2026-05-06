import { z } from "zod";

export const voucherSchema = z
  .object({
    code: z
      .string()
      .min(3, "Mã tối thiểu 3 ký tự")
      .regex(/^[A-Z0-9_]+$/, "Chỉ dùng chữ in hoa, số và _"),
    type: z.enum(["percent", "fixed"]),
    value: z.coerce.number().min(0, "Giá trị không hợp lệ"),
    minOrder: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).default(0),
    startAt: z.string().min(1, "Vui lòng chọn ngày bắt đầu"),
    endAt: z.string().min(1, "Vui lòng chọn ngày kết thúc"),
    usageLimit: z.coerce.number().int().min(1, "Tối thiểu 1 lượt"),
    active: z.boolean().default(true),
    description: z.string().optional().default(""),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["endAt"],
  })
  .refine(
    (d) => (d.type === "percent" ? d.value > 0 && d.value <= 100 : true),
    { message: "Phần trăm phải trong khoảng 1-100", path: ["value"] }
  );

export const voucherDefaults = {
  code: "",
  type: "percent",
  value: 10,
  minOrder: 0,
  maxDiscount: 0,
  startAt: new Date().toISOString().slice(0, 10),
  endAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString().slice(0, 10),
  usageLimit: 100,
  active: true,
  description: "",
};

export function voucherStatus(v) {
  const now = new Date();
  const start = new Date(v.startAt);
  const end = new Date(v.endAt);
  if (!v.active) return "inactive";
  if (start > now) return "upcoming";
  if (end < now) return "expired";
  if (v.usedCount >= v.usageLimit) return "used_up";
  return "active";
}
