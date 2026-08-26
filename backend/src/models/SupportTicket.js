const mongoose = require("mongoose");

// Five distinct problems the customer can report. The older, wider list let the
// same complaint arrive under several codes (a damaged book could be
// DAMAGED_ITEM or RETURN) with different SLA and different checks, so the codes
// below are deliberately non-overlapping and the specific fault ("damaged",
// "wrong", "missing") is now captured as itemIssue inside ITEM_FAULT.
const SUPPORT_CATEGORIES = Object.freeze([
  "NOT_RECEIVED",
  "ITEM_FAULT",
  "PAYMENT_ISSUE",
  "RETURN_REQUEST",
  "OTHER",
]);

// Categories where the shop is at fault: a longer claim window applies and the
// shop pays return shipping.
const SHOP_FAULT_CATEGORIES = Object.freeze(["NOT_RECEIVED", "ITEM_FAULT"]);

// The concrete defect, required for ITEM_FAULT. Mirrors ReturnRequest.REASON so
// a ticket no longer has to guess the return reason from its category.
const ITEM_ISSUES = Object.freeze([
  "DAMAGED",
  "WRONG_ITEM",
  "MISSING_ITEM",
  "QUALITY_ISSUE",
]);

const SUPPORT_STATUSES = Object.freeze([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
]);

const SUPPORT_PRIORITIES = Object.freeze(["LOW", "NORMAL", "HIGH", "URGENT"]);

// Enum values sort alphabetically in MongoDB, which does not match their
// business ordering. These numeric ranks are persisted alongside the enums so
// the support queue can sort by real urgency.
const STATUS_RANK = Object.freeze({
  OPEN: 0,
  IN_PROGRESS: 1,
  WAITING_CUSTOMER: 2,
  RESOLVED: 3,
  CLOSED: 4,
});

const PRIORITY_RANK = Object.freeze({ LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 });

// Money-related complaints are triaged above generic questions on arrival so
// agents do not have to raise them by hand.
const CATEGORY_PRIORITY = Object.freeze({
  NOT_RECEIVED: "HIGH",
  ITEM_FAULT: "HIGH",
  PAYMENT_ISSUE: "HIGH",
  // The customer changing their mind is not an incident.
  RETURN_REQUEST: "NORMAL",
  OTHER: "NORMAL",
});

// Resolution states that are terminal: either the business outcome succeeded,
// or it failed/was cancelled for good. Both must let an agent close the ticket.
const RESOLUTION_SUCCESS_STATUSES = Object.freeze([
  "RETURN_COMPLETED",
  "REFUND_COMPLETED",
  "DELIVERED",
  "COMPLETED",
]);

const RESOLUTION_ABANDONED_STATUSES = Object.freeze([
  "FAILED",
  "REFUND_FAILED",
  "CANCELLED",
]);

const RESOLUTION_TERMINAL_STATUSES = Object.freeze([
  ...RESOLUTION_SUCCESS_STATUSES,
  ...RESOLUTION_ABANDONED_STATUSES,
]);

const RETURN_REASONS = Object.freeze([
  "DAMAGED",
  "WRONG_ITEM",
  "MISSING_ITEM",
  "QUALITY_ISSUE",
  "OTHER",
]);

const SLA_MINUTES = Object.freeze({
  LOW: { response: 8 * 60, resolution: 5 * 24 * 60 },
  NORMAL: { response: 4 * 60, resolution: 2 * 24 * 60 },
  HIGH: { response: 60, resolution: 24 * 60 },
  URGENT: { response: 30, resolution: 8 * 60 },
});

const resolutionItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    imageUrl: { type: String, default: "", maxlength: 2048 },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 99, validate: Number.isInteger },
  },
  { _id: false }
);

const requestedItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    author: { type: String, default: "", trim: true, maxlength: 200 },
    imageUrl: { type: String, default: "", maxlength: 2048 },
    unitPrice: { type: Number, required: true, min: 0 },
    orderedQuantity: { type: Number, required: true, min: 1, max: 99 },
    quantity: { type: Number, required: true, min: 1, max: 99 },
  },
  { _id: false }
);

const resolutionEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 60 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, default: "", trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const resolutionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "GUIDANCE",
        "APPROVE_ORDER",
        "CANCEL_ORDER",
        "CREATE_SHIPMENT",
        "RETURN_REFUND",
        "PARTIAL_REFUND",
        "RESHIP",
        "LOST_IN_TRANSIT_REFUND",
        "LOST_IN_TRANSIT_RESHIP",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "INITIATING",
        "RETURNING",
        "RETURN_COMPLETED",
        "REFUND_PENDING",
        // Gateway accepted the refund but has not settled it. Deliberately not
        // a success status: the ticket stays open until the money lands.
        "REFUND_PROCESSING",
        "REFUND_MANUAL_REQUIRED",
        "REFUND_COMPLETED",
        "REFUND_FAILED",
        "PREPARING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
        "FAILED",
        "ACTION_PENDING",
        "COMPLETED",
      ],
      required: true,
    },
    items: { type: [resolutionItemSchema], required: true },
    amount: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", trim: true, maxlength: 1000 },
    returnRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ReturnRequest", default: null },
    refund: {
      idempotencyKey: { type: String, default: "", maxlength: 250, select: false },
      transactionId: { type: String, default: "", maxlength: 250 },
      // Immutable context for matching a gateway settlement to this exact
      // business operation. `orderCode` alone is not a refund identifier: one
      // order may have an order refund, a return refund and a support refund.
      businessType: { type: String, enum: ["SUPPORT"], default: "SUPPORT" },
      sourceId: { type: String, default: "", maxlength: 50 },
      amount: { type: Number, default: 0, min: 0 },
      paymentMethod: { type: String, enum: ["VNPAY", "MOMO", "COD"], default: null },
      originalPaymentTransactionId: { type: String, default: "", maxlength: 250 },
      originalProviderOrderId: { type: String, default: "", maxlength: 250 },
      lastError: { type: String, default: "", maxlength: 500 },
      completedAt: { type: Date, default: null },
    },
    shipment: {
      provider: { type: String, enum: ["ghn"], default: null },
      environment: { type: String, enum: ["sandbox"], default: null },
      carrier: { type: String, default: "", trim: true, maxlength: 100 },
      clientOrderCode: { type: String, default: "", trim: true, maxlength: 100 },
      trackingNumber: { type: String, default: "", trim: true, maxlength: 100 },
      providerStatus: { type: String, default: "", trim: true, maxlength: 100 },
      // Zero for a free replacement of an already-paid order. A lost COD
      // parcel that was never collected carries the original outstanding
      // amount here and must not be completed without it.
      codAmount: { type: Number, default: 0, min: 0 },
      estimatedDelivery: { type: Date, default: null },
      shippedAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    events: { type: [resolutionEventSchema], default: [] },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketCode: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    category: { type: String, enum: SUPPORT_CATEGORIES, required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    requestDetails: {
      returnReason: { type: String, enum: RETURN_REASONS, default: null },
      // The specific defect for an ITEM_FAULT ticket. Feeds the return reason
      // directly instead of being inferred from the category.
      itemIssue: { type: String, enum: ITEM_ISSUES, default: null },
      items: { type: [requestedItemSchema], default: [] },
    },
    // Whose mistake this was, decided from the category at creation. Drives the
    // claim window and who pays return shipping.
    faultParty: { type: String, enum: ["shop", "customer"], default: "customer", index: true },
    attachments: {
      type: [String],
      default: [],
      validate: {
        validator: (items) => items.length <= 3 && new Set(items).size === items.length,
        message: "Ticket chỉ được đính kèm tối đa 3 ảnh khác nhau",
      },
    },
    status: { type: String, enum: SUPPORT_STATUSES, default: "OPEN", index: true },
    priority: { type: String, enum: SUPPORT_PRIORITIES, default: "NORMAL", index: true },
    statusRank: { type: Number, default: 0, index: true },
    priorityRank: { type: Number, default: 1, index: true },
    // Time the ticket sat in WAITING_CUSTOMER. The resolution deadline is
    // pushed out by this much so agents are not penalised for customer delay.
    waitingCustomerSince: { type: Date, default: null },
    waitingCustomerMs: { type: Number, default: 0, min: 0 },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    responseDueAt: { type: Date, required: true, index: true },
    resolutionDueAt: { type: Date, required: true, index: true },
    firstRespondedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: "", maxlength: 240 },
    resolution: { type: resolutionSchema, default: null },
  },
  { timestamps: true }
);

supportTicketSchema.index({ statusRank: 1, priorityRank: -1, responseDueAt: 1, createdAt: 1 });
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, waitingCustomerSince: 1 });
supportTicketSchema.index({ "resolution.refund.transactionId": 1 });

supportTicketSchema.pre("validate", function () {
  if (!this.ticketCode) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.ticketCode = `TK-${timestamp}-${random}`;
  }
  // Triage on arrival only: an agent's explicit priority must never be
  // overwritten by the category default on a later save.
  if (this.isNew && !this.isModified("priority") && CATEGORY_PRIORITY[this.category]) {
    this.priority = CATEGORY_PRIORITY[this.category];
  }
  if (this.isNew) {
    this.faultParty = SHOP_FAULT_CATEGORIES.includes(this.category) ? "shop" : "customer";
  }
  if (!this.responseDueAt || !this.resolutionDueAt) {
    const { slaDeadlines } = require("../services/supportSlaService");
    const deadlines = slaDeadlines(this.priority, new Date(), SLA_MINUTES);
    this.responseDueAt ||= deadlines.responseDueAt;
    this.resolutionDueAt ||= deadlines.resolutionDueAt;
  }
  this.statusRank = STATUS_RANK[this.status] ?? 0;
  this.priorityRank = PRIORITY_RANK[this.priority] ?? 1;
});

// The resolution service drives status through findOneAndUpdate, which skips
// document middleware. Mirror the ranks here so queue ordering never drifts.
supportTicketSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
  const update = this.getUpdate();
  if (!update) return;
  const set = update.$set || update;
  const nextStatus = set.status;
  const nextPriority = set.priority;
  if (nextStatus === undefined && nextPriority === undefined) return;
  const patch = update.$set ? update.$set : update;
  if (nextStatus !== undefined && STATUS_RANK[nextStatus] !== undefined) {
    patch.statusRank = STATUS_RANK[nextStatus];
  }
  if (nextPriority !== undefined && PRIORITY_RANK[nextPriority] !== undefined) {
    patch.priorityRank = PRIORITY_RANK[nextPriority];
  }
  this.setUpdate(update);
});

// Old category codes and what they became. MISSING_ITEM/WRONG_ITEM/DAMAGED_ITEM
// and the old RETURN all described "something is wrong with the goods", so they
// collapse into ITEM_FAULT carrying the specific defect; the old RETURN keeps
// its customer-initiated meaning only when no defect was recorded.
const LEGACY_CATEGORY_MAP = Object.freeze({
  DELIVERY: { category: "NOT_RECEIVED", faultParty: "shop" },
  MISSING_ITEM: { category: "ITEM_FAULT", itemIssue: "MISSING_ITEM", faultParty: "shop" },
  WRONG_ITEM: { category: "ITEM_FAULT", itemIssue: "WRONG_ITEM", faultParty: "shop" },
  DAMAGED_ITEM: { category: "ITEM_FAULT", itemIssue: "DAMAGED", faultParty: "shop" },
  RETURN: { category: "RETURN_REQUEST", faultParty: "customer" },
  PAYMENT: { category: "PAYMENT_ISSUE", faultParty: "customer" },
  REFUND: { category: "PAYMENT_ISSUE", faultParty: "customer" },
  OTHER: { category: "OTHER", faultParty: "customer" },
});

/**
 * Rewrites tickets stored under the pre-consolidation category codes. Without
 * this they hold values outside the current enum, so any save would fail
 * validation and the admin filters would never match them.
 */
supportTicketSchema.statics.migrateCategories = async function migrateCategories() {
  const operations = [];
  for (const [legacy, target] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (legacy === target.category) continue;
    const update = {
      category: target.category,
      faultParty: target.faultParty,
    };
    if (target.itemIssue) update["requestDetails.itemIssue"] = target.itemIssue;
    operations.push({
      updateMany: { filter: { category: legacy }, update: { $set: update } },
    });
  }
  // A legacy RETURN ticket that recorded a defect belongs with the fault flow.
  operations.push({
    updateMany: {
      filter: {
        category: "RETURN_REQUEST",
        "requestDetails.returnReason": { $in: ["DAMAGED", "WRONG_ITEM", "MISSING_ITEM", "QUALITY_ISSUE"] },
        "requestDetails.itemIssue": null,
      },
      update: [
        {
          $set: {
            category: "ITEM_FAULT",
            faultParty: "shop",
            "requestDetails.itemIssue": "$requestDetails.returnReason",
          },
        },
      ],
    },
  });
  if (!operations.length) return { updated: 0 };
  const result = await this.bulkWrite(operations, { ordered: true });
  return { updated: result.modifiedCount || 0 };
};

/**
 * Backfills the queue-ordering ranks for tickets created before they existed.
 * Without this, older tickets all carry the schema defaults and sort as if they
 * were OPEN/NORMAL.
 */
supportTicketSchema.statics.migrateQueueRanks = async function migrateQueueRanks() {
  const operations = [];
  for (const [status, statusRank] of Object.entries(STATUS_RANK)) {
    for (const [priority, priorityRank] of Object.entries(PRIORITY_RANK)) {
      operations.push({
        updateMany: {
          filter: {
            status,
            priority,
            $or: [
              { statusRank: { $ne: statusRank } },
              { priorityRank: { $ne: priorityRank } },
            ],
          },
          update: { $set: { statusRank, priorityRank } },
        },
      });
    }
  }
  const result = await this.bulkWrite(operations, { ordered: false });
  return { updated: result.modifiedCount || 0 };
};

supportTicketSchema.statics.CATEGORIES = SUPPORT_CATEGORIES;
supportTicketSchema.statics.STATUSES = SUPPORT_STATUSES;
supportTicketSchema.statics.PRIORITIES = SUPPORT_PRIORITIES;
supportTicketSchema.statics.SLA_MINUTES = SLA_MINUTES;
supportTicketSchema.statics.STATUS_RANK = STATUS_RANK;
supportTicketSchema.statics.PRIORITY_RANK = PRIORITY_RANK;
supportTicketSchema.statics.CATEGORY_PRIORITY = CATEGORY_PRIORITY;
supportTicketSchema.statics.SHOP_FAULT_CATEGORIES = SHOP_FAULT_CATEGORIES;
supportTicketSchema.statics.ITEM_ISSUES = ITEM_ISSUES;
supportTicketSchema.statics.LEGACY_CATEGORY_MAP = LEGACY_CATEGORY_MAP;
supportTicketSchema.statics.RESOLUTION_SUCCESS_STATUSES = RESOLUTION_SUCCESS_STATUSES;
supportTicketSchema.statics.RESOLUTION_ABANDONED_STATUSES = RESOLUTION_ABANDONED_STATUSES;
supportTicketSchema.statics.RESOLUTION_TERMINAL_STATUSES = RESOLUTION_TERMINAL_STATUSES;

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
