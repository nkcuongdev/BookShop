import { z } from "zod";

const intField = (min, max, message) =>
  z.coerce
    .number({ error: message })
    .int({ error: message })
    .min(min, message)
    .max(max, message);

export const tierSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2, "Mã hạng tối thiểu 2 ký tự")
    .max(30)
    .regex(/^[a-z0-9_-]+$/, "Mã hạng chỉ gồm chữ thường, số, _ và -"),
  label: z.string().trim().min(1, "Nhập tên hạng").max(60),
  threshold: intField(0, 100_000_000_000, "Ngưỡng phải là số nguyên không âm"),
  multiplier: z.coerce
    .number({ error: "Hệ số không hợp lệ" })
    .min(0, "Hệ số không âm")
    .max(10, "Hệ số tối đa 10"),
  benefits: z.array(z.string().trim().max(200)).max(20).optional().default([]),
});

export const loyaltyProgramSchema = z
  .object({
    enabled: z.boolean(),
    earnRate: intField(1_000, 10_000_000, "Tỉ lệ tích điểm từ 1.000đ trở lên"),
    redeemEnabled: z.boolean(),
    redeemRate: intField(100, 1_000_000, "Tỉ lệ quy đổi từ 100đ trở lên"),
    redeemMinPoints: intField(1, 1_000_000, "Điểm tối thiểu phải lớn hơn 0"),
    redeemMaxPercent: intField(1, 100, "Trần dùng điểm từ 1 đến 100%"),
    redeemStep: intField(1, 1_000, "Bội số điểm phải lớn hơn 0"),
    tierWindowDays: intField(30, 1_095, "Cửa sổ xét hạng từ 30 đến 1095 ngày"),
    tierGraceDays: intField(0, 180, "Thời gian ân hạn từ 0 đến 180 ngày"),
    tiers: z.array(tierSchema).min(1, "Cần ít nhất một hạng").max(10),
  })
  .superRefine((data, ctx) => {
    // The lowest rung must start at zero, or a new customer belongs to no tier
    // at all and earns nothing.
    const sorted = [...data.tiers].sort((a, b) => a.threshold - b.threshold);
    if (sorted[0]?.threshold !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["tiers"],
        message: "Hạng thấp nhất phải có ngưỡng chi tiêu bằng 0",
      });
    }

    const keys = new Set();
    for (const tier of data.tiers) {
      if (keys.has(tier.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers"],
          message: `Mã hạng "${tier.key}" bị trùng`,
        });
      }
      keys.add(tier.key);
    }

    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].threshold === sorted[i - 1].threshold) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers"],
          message: "Các hạng không được trùng ngưỡng chi tiêu",
        });
        break;
      }
      // A higher tier that earns less than a lower one is a configuration
      // mistake customers would notice before the shop did.
      if (sorted[i].multiplier < sorted[i - 1].multiplier) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers"],
          message: "Hạng cao hơn không được có hệ số tích điểm thấp hơn",
        });
        break;
      }
    }
  });

export const loyaltyProgramDefaults = {
  enabled: true,
  earnRate: 10_000,
  redeemEnabled: true,
  redeemRate: 1_000,
  redeemMinPoints: 10,
  redeemMaxPercent: 30,
  redeemStep: 10,
  tierWindowDays: 365,
  tierGraceDays: 30,
  tiers: [],
};

export const giftSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Mã quà tối thiểu 3 ký tự")
      // Capped at 20 because the minted voucher code is GIFT_<code>_<8 hex>,
      // which must fit Voucher.code's 40-character limit.
      .max(20, "Mã quà tối đa 20 ký tự")
      .regex(/^[A-Z0-9_]+$/, "Mã quà chỉ gồm chữ in hoa, số và _"),
    name: z.string().trim().min(1, "Nhập tên quà").max(150),
    description: z.string().trim().max(1_000).optional().or(z.literal("")),
    imageUrl: z.string().trim().max(2_048).optional().or(z.literal("")),
    pointsCost: intField(1, 1_000_000, "Điểm cần đổi phải lớn hơn 0"),
    minTierKey: z.string().trim().max(30).optional().or(z.literal("")),
    stock: intField(0, 1_000_000, "Số lượng phải là số nguyên không âm"),
    perUserLimit: intField(1, 100, "Giới hạn mỗi khách từ 1 đến 100"),
    active: z.boolean(),
    sortOrder: intField(0, 10_000, "Thứ tự phải là số nguyên không âm"),
    voucherTemplate: z.object({
      type: z.enum(["percent", "fixed"]),
      scope: z.enum(["order", "shipping"]),
      value: z.coerce
        .number({ error: "Giá trị không hợp lệ" })
        .min(0.01, "Giá trị phải lớn hơn 0"),
      minOrder: intField(0, 1_000_000_000, "Đơn tối thiểu không âm"),
      maxDiscount: intField(0, 1_000_000_000, "Giảm tối đa không âm"),
      validDays: intField(1, 365, "Hạn dùng từ 1 đến 365 ngày"),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.voucherTemplate.type === "percent" && data.voucherTemplate.value > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["voucherTemplate", "value"],
        message: "Voucher phần trăm không được vượt quá 100",
      });
    }
  });

export const giftDefaults = {
  code: "",
  name: "",
  description: "",
  imageUrl: "",
  pointsCost: 50,
  minTierKey: "",
  stock: 0,
  perUserLimit: 1,
  active: true,
  sortOrder: 0,
  voucherTemplate: {
    type: "fixed",
    scope: "order",
    value: 20_000,
    minOrder: 0,
    maxDiscount: 0,
    validDays: 30,
  },
};

export const pointsAdjustSchema = z
  .object({
    points: z.coerce
      .number({ error: "Nhập số điểm" })
      .int({ error: "Số điểm phải là số nguyên" })
      .refine((value) => value !== 0, "Số điểm phải khác 0"),
    // Ten characters, not one: this is issuing value to a named customer, and
    // "ok" is not an audit trail anybody can act on later.
    reason: z
      .string()
      .trim()
      .min(10, "Lý do tối thiểu 10 ký tự")
      .max(500, "Lý do tối đa 500 ký tự"),
  })
  .refine((data) => Number.isFinite(data.points), {
    path: ["points"],
    message: "Số điểm không hợp lệ",
  });

export const pointsAdjustDefaults = { points: 0, reason: "" };
