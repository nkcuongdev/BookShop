const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const {
  DEFAULT_NOTIFICATION_PREFERENCES,
} = require("../utils/notificationPreferences");
const { DEFAULT_ROLE } = require("../config/permissions");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: "Nhà", trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: {
      type: String,
      required: true,
      trim: true,
      minlength: 6,
      maxlength: 20,
      match: /^[0-9+().\s-]+$/,
    },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    city: { type: String, default: "", trim: true, maxlength: 100 },
    district: { type: String, default: "", trim: true, maxlength: 100 },
    ward: { type: String, default: "", trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const notificationChannelSchema = new mongoose.Schema(
  {
    order: { type: Boolean, default: true },
    payment: { type: Boolean, default: true },
    shipping: { type: Boolean, default: true },
    refund: { type: Boolean, default: true },
    chat: { type: Boolean, default: true },
    stock: { type: Boolean, default: true },
    promotion: { type: Boolean, default: true },
    review: { type: Boolean, default: true },
    loyalty: { type: Boolean, default: true },
    system: { type: Boolean, default: true },
  },
  { _id: false }
);

const emailNotificationChannelSchema = new mongoose.Schema(
  Object.fromEntries(
    Object.keys(DEFAULT_NOTIFICATION_PREFERENCES.email).map((type) => [
      type,
      {
        type: Boolean,
        default: DEFAULT_NOTIFICATION_PREFERENCES.email[type],
      },
    ])
  ),
  { _id: false }
);

// Loyalty programme state for one customer.
//
// `pointsBalance` is a snapshot: LoyaltyLedger is the source of truth, and
// loyaltyService.reconcileBalances exists to prove the two still agree. Nothing
// outside loyaltyService.applyPointsMovement may write to it.
//
// The tier multiplier is deliberately absent. It is derivable from tierKey plus
// the programme config, and storing it here would drift the moment an admin
// edits the ladder. The immutable snapshot belongs on the ledger row instead.
const loyaltySchema = new mongoose.Schema(
  {
    pointsBalance: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    // Points that could not be clawed back after a refund. They are never
    // converted to money or a negative balance; future earned points settle
    // this amount before becoming spendable.
    pointsDebt: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    lifetimeDebtAccrued: { type: Number, default: 0, min: 0 },
    lifetimeDebtSettled: { type: Number, default: 0, min: 0 },
    // Display-only totals. Never used to compute anything.
    lifetimeEarned: { type: Number, default: 0, min: 0 },
    lifetimeRedeemed: { type: Number, default: 0, min: 0 },

    tierKey: { type: String, default: "", trim: true, lowercase: true, maxlength: 30 },
    // Spend inside the rolling window, refreshed by the tier job. Whole VND.
    spend12m: { type: Number, default: 0, min: 0 },
    tierEvaluatedAt: { type: Date, default: null },
    // While set and in the future, a customer keeps a tier they have dropped
    // below. Cleared on promotion or once the grace period lapses.
    tierValidUntil: { type: Date, default: null },
    // Last point movement of any kind, kept for a future inactivity-based
    // expiry policy. Unused while expiry is switched off.
    lastActivityAt: { type: Date, default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: { type: String, required: true, minlength: 8 },
    phone: { type: String, default: "" },
    addresses: {
      type: [addressSchema],
      default: [],
      validate: {
        validator: (addresses) => addresses.length <= 10,
        message: "A user cannot store more than 10 addresses",
      },
    },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }],
    notificationPreferences: {
      inApp: { type: notificationChannelSchema, default: () => ({}) },
      email: { type: emailNotificationChannelSchema, default: () => ({}) },
    },
    // Role key from the Role collection. Not an enum: admins create roles at
    // runtime. routes/users.js validates against the registry before writing,
    // and an unknown key grants nothing (roleRegistry fails closed).
    role: { type: String, default: DEFAULT_ROLE, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["active", "banned"],
      default: "active",
    },
    avatar: { type: String, default: "" },
    tokenVersion: { type: Number, default: 0, min: 0, select: false },
    // Serializes concurrent COD reservations for this account. The value has
    // no business meaning and is kept private from API projections.
    codReservationGuardAt: { type: Date, default: null, select: false },
    // Same transaction guard for online orders, preventing concurrent
    // requests from crossing the active inventory-reservation cap.
    onlineReservationGuardAt: { type: Date, default: null, select: false },
    emailVerifiedAt: { type: Date, default: null },
    loyalty: { type: loyaltySchema, default: () => ({}) },
    pendingEmail: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      validate: {
        validator: (value) =>
          !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: "Pending email is invalid",
      },
    },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpiresAt: { type: Date, default: null, select: false },
    emailChangeTokenHash: { type: String, default: null, select: false },
    emailChangeExpiresAt: { type: Date, default: null, select: false },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// bcryptjs is pure JS, so each hash at cost 10 costs ~160ms of blocked CPU.
// The test suite creates hundreds of users, which dominated its runtime; drop
// to the minimum cost under NODE_ENV=test only. Production keeps cost 10.
const PASSWORD_HASH_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 10;

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, PASSWORD_HASH_ROUNDS);
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Static methods
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: String(email || "").trim().toLowerCase() });
};

userSchema.index({ role: 1, status: 1, createdAt: -1 });
userSchema.index(
  { passwordResetExpiresAt: 1 },
  { partialFilterExpression: { passwordResetExpiresAt: { $type: "date" } } }
);

userSchema.index(
  { emailVerificationExpiresAt: 1 },
  { partialFilterExpression: { emailVerificationExpiresAt: { $type: "date" } } }
);
userSchema.index(
  { emailChangeExpiresAt: 1 },
  { partialFilterExpression: { emailChangeExpiresAt: { $type: "date" } } }
);

// The tier job pulls the least recently evaluated customers each tick, so this
// index backs both the filter and the sort.
userSchema.index({ "loyalty.tierEvaluatedAt": 1 });
userSchema.index({ "loyalty.tierKey": 1 });

const User = mongoose.model("User", userSchema);
module.exports = User;
