import { z } from "zod";

export const PAYMENT_TERMS = [
  { value: "COD", label: "Thanh toán khi nhận hàng" },
  { value: "PREPAID", label: "Trả trước" },
  { value: "NET_7", label: "Công nợ 7 ngày" },
  { value: "NET_15", label: "Công nợ 15 ngày" },
  { value: "NET_30", label: "Công nợ 30 ngày" },
];

export const paymentTermsLabel = (value) =>
  PAYMENT_TERMS.find((term) => term.value === value)?.label || value || "—";

const optionalEmail = z
  .string()
  .max(200)
  .default("")
  .refine((value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
    message: "Email không hợp lệ",
  });

export const supplierSchema = z.object({
  code: z
    .string()
    .min(2, "Mã tối thiểu 2 ký tự")
    .max(30, "Mã tối đa 30 ký tự")
    .regex(/^[A-Za-z0-9_-]+$/, "Chỉ dùng chữ, số, gạch ngang và _"),
  name: z.string().min(1, "Vui lòng nhập tên nhà cung cấp").max(200),
  taxCode: z.string().max(30, "Mã số thuế tối đa 30 ký tự").default(""),
  phone: z.string().max(20, "Số điện thoại tối đa 20 ký tự").default(""),
  email: optionalEmail,
  website: z.string().max(300).default(""),
  address: z
    .object({
      line: z.string().max(500).default(""),
      ward: z.string().max(100).default(""),
      district: z.string().max(100).default(""),
      province: z.string().max(100).default(""),
    })
    .default({}),
  contactPerson: z
    .object({
      name: z.string().max(100).default(""),
      phone: z.string().max(20).default(""),
      email: optionalEmail,
    })
    .default({}),
  paymentTerms: z
    .enum(["COD", "NET_7", "NET_15", "NET_30", "PREPAID"])
    .default("COD"),
  leadTimeDays: z.coerce
    .number()
    .int("Số ngày phải là số nguyên")
    .min(0, "Không được âm")
    .max(365, "Tối đa 365 ngày")
    .default(0),
  status: z.enum(["active", "inactive"]).default("active"),
  note: z.string().max(1000, "Ghi chú tối đa 1000 ký tự").default(""),
});

export const supplierDefaults = {
  code: "",
  name: "",
  taxCode: "",
  phone: "",
  email: "",
  website: "",
  address: { line: "", ward: "", district: "", province: "" },
  contactPerson: { name: "", phone: "", email: "" },
  paymentTerms: "COD",
  leadTimeDays: 0,
  status: "active",
  note: "",
};

export function supplierToForm(supplier) {
  if (!supplier) return supplierDefaults;
  return {
    ...supplierDefaults,
    ...supplier,
    address: { ...supplierDefaults.address, ...(supplier.address || {}) },
    contactPerson: {
      ...supplierDefaults.contactPerson,
      ...(supplier.contactPerson || {}),
    },
  };
}

/** Single-line address for tables and summaries. */
export function formatSupplierAddress(address = {}) {
  return [address.line, address.ward, address.district, address.province]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}
