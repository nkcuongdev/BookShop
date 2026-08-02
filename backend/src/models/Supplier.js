const mongoose = require("mongoose");
const { safeRegex } = require("../utils/security");

const PAYMENT_TERMS = ["COD", "NET_7", "NET_15", "NET_30", "PREPAID"];

const supplierAddressSchema = new mongoose.Schema(
  {
    line: { type: String, default: "", trim: true, maxlength: 500 },
    ward: { type: String, default: "", trim: true, maxlength: 100 },
    district: { type: String, default: "", trim: true, maxlength: 100 },
    province: { type: String, default: "", trim: true, maxlength: 100 },
  },
  { _id: false }
);

const contactPersonSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true, maxlength: 100 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 200 },
  },
  { _id: false }
);

const supplierSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 30,
      match: /^[A-Z0-9_-]+$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    taxCode: { type: String, default: "", trim: true, maxlength: 30 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 200 },
    website: { type: String, default: "", trim: true, maxlength: 300 },
    address: { type: supplierAddressSchema, default: () => ({}) },
    contactPerson: { type: contactPersonSchema, default: () => ({}) },
    paymentTerms: { type: String, enum: PAYMENT_TERMS, default: "COD" },
    // Average days between placing an order and receiving it. Feeds the
    // reorder suggestion on the low-stock screen.
    leadTimeDays: { type: Number, default: 0, min: 0, max: 365 },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true }
);

supplierSchema.index({ status: 1, name: 1 });

supplierSchema.statics.search = function (query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  const regex = query.search ? safeRegex(query.search) : null;
  if (regex) {
    filter.$or = [
      { code: regex },
      { name: regex },
      { taxCode: regex },
      { phone: regex },
      { email: regex },
    ];
  }
  return filter;
};

const Supplier = mongoose.model("Supplier", supplierSchema);
Supplier.PAYMENT_TERMS = PAYMENT_TERMS;
module.exports = Supplier;
