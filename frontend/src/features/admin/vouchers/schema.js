import { z } from "zod";

export const voucherSchema = z
  .object({
    code: z
      .string()
      .min(3, "Mã tối thiểu 3 ký tự")
      .max(40, "Mã tối đa 40 ký tự")
      .regex(/^[A-Z0-9_]+$/, "Chỉ dùng chữ in hoa, số và _"),
    type: z.enum(["percent", "fixed"]),
    scope: z.enum(["order", "shipping"]).default("order"),
    value: z.coerce.number().positive("Giá trị phải lớn hơn 0"),
    minOrder: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).default(0),
    startAt: z.string().min(1, "Vui lòng chọn ngày bắt đầu"),
    endAt: z.string().min(1, "Vui lòng chọn ngày kết thúc"),
    usageLimit: z.coerce.number().int().min(1, "Tối thiểu 1 lượt"),
    perUserLimit: z.coerce.number().int().min(1, "Tối thiểu 1 lượt mỗi khách"),
    active: z.boolean().default(true),
    publicVisible: z.boolean().default(false),
    description: z.string().max(500, "Mô tả tối đa 500 ký tự").default(""),
  })
  .refine((data) => data.endAt >= data.startAt, {
    message: "Ngày kết thúc không được trước ngày bắt đầu",
    path: ["endAt"],
  })
  .refine(
    (data) =>
      data.type === "percent" ? data.value > 0 && data.value <= 100 : true,
    { message: "Phần trăm phải trong khoảng 1-100", path: ["value"] }
  )
  .refine((data) => data.perUserLimit <= data.usageLimit, {
    message: "Giới hạn mỗi khách không được vượt tổng lượt",
    path: ["perUserLimit"],
  })
  .transform((data) => ({
    ...data,
    maxDiscount: data.type === "percent" ? data.maxDiscount : 0,
  }));

export const voucherDefaults = {
  code: "",
  type: "percent",
  scope: "order",
  value: 10,
  minOrder: 0,
  maxDiscount: 0,
  startAt: new Date().toISOString().slice(0, 10),
  endAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString().slice(0, 10),
  usageLimit: 100,
  perUserLimit: 1,
  active: true,
  publicVisible: false,
  description: "",
};

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function vietnamBoundaryIso(dateOnly, addDays = 0) {
  const [year, month, day] = String(dateOnly).split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + addDays, -7, 0, 0, 0)
  ).toISOString();
}

export function campaignDatesToApi(startAt, endAt) {
  return {
    startAt: vietnamBoundaryIso(startAt),
    // The selected end day is inclusive in the form and stored as the next
    // Vietnam midnight, making the server interval [startAt, endAt).
    endAt: vietnamBoundaryIso(endAt, 1),
  };
}

export function campaignDateToInput(value, { endExclusive = false } = {}) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  return new Date(
    timestamp + VIETNAM_OFFSET_MS - (endExclusive ? 1 : 0)
  )
    .toISOString()
    .slice(0, 10);
}

export function voucherStatus(voucher) {
  const now = new Date();
  const start = new Date(voucher.startAt);
  const end = new Date(voucher.endAt);
  if (!voucher.active) return "inactive";
  if (start > now) return "upcoming";
  if (end <= now) return "expired";
  if (voucher.usedCount >= voucher.usageLimit) return "used_up";
  return "active";
}
