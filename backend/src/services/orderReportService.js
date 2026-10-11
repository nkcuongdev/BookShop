const { once } = require("events");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const { safeRegex } = require("../utils/security");

const VIETNAM_OFFSET = "+07:00";
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function reportError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseVietnamCalendarDate(value, endOfDay = false) {
  const normalized = String(value || "").trim();
  const match = normalized.match(DATE_PATTERN);
  if (!match) return null;
  const [, year, month, day] = match;
  const utcCheck = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(utcCheck.getTime()) ||
    utcCheck.getUTCFullYear() !== Number(year) ||
    utcCheck.getUTCMonth() + 1 !== Number(month) ||
    utcCheck.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${normalized}T${time}${VIETNAM_OFFSET}`);
}

function normalizeEnumFilter(value, allowedValues, label) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "ALL") return "";
  if (!allowedValues.includes(normalized)) {
    throw reportError(`${label} không hợp lệ`);
  }
  return normalized;
}

// The return statuses one admin return filter stands for: approval now stores
// RETURNING and APPROVED survives only on legacy requests. null = no filter.
function returnStatusesForFilter(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "ALL") return null;
  return normalized === ReturnRequest.STATUS.APPROVED
    ? [ReturnRequest.STATUS.APPROVED, ReturnRequest.STATUS.RETURNING]
    : [normalized];
}

// Per order: how many return requests it has, and the one to show - the newest
// matching the active return filter (an order matched through an older PENDING
// request must not be labelled with its newer REJECTED one), else the newest.
// Shared by the admin list badge and the CSV so both say the same thing.
function summarizeReturnsByOrder(requests, returnStatus) {
  const statuses = returnStatusesForFilter(returnStatus);
  const byOrder = new Map();
  const newestFirst = [...requests].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  );
  for (const request of newestFirst) {
    const key = String(request.order);
    const entry = byOrder.get(key) || { shown: null, count: 0 };
    entry.count += 1;
    if (!entry.shown && (!statuses || statuses.includes(request.status))) {
      entry.shown = request;
    }
    byOrder.set(key, entry);
  }
  return byOrder;
}

async function buildAdminOrderFilters(query = {}) {
  const baseFilter = {};
  const searchRegex = safeRegex(String(query.search || "").slice(0, 100));
  if (searchRegex) {
    baseFilter.$or = [
      { orderCode: searchRegex },
      { "shippingAddress.fullName": searchRegex },
      { "shippingAddress.phone": searchRegex },
    ];
  }

  const dateFromValue = String(query.dateFrom || "").trim();
  const dateToValue = String(query.dateTo || "").trim();
  const dateFrom = dateFromValue
    ? parseVietnamCalendarDate(dateFromValue, false)
    : null;
  const dateTo = dateToValue
    ? parseVietnamCalendarDate(dateToValue, true)
    : null;
  if (dateFromValue && !dateFrom) throw reportError("Ngày bắt đầu không hợp lệ");
  if (dateToValue && !dateTo) throw reportError("Ngày kết thúc không hợp lệ");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw reportError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
  }
  if (dateFrom || dateTo) {
    baseFilter.placedAt = {
      ...(dateFrom ? { $gte: dateFrom } : {}),
      ...(dateTo ? { $lte: dateTo } : {}),
    };
  }

  const paymentStatus = normalizeEnumFilter(
    query.paymentStatus,
    Object.values(Order.PAYMENT_STATUS),
    "Trạng thái thanh toán"
  );
  const paymentMethod = normalizeEnumFilter(
    query.paymentMethod,
    Object.values(Order.PAYMENT_METHOD),
    "Phương thức thanh toán"
  );
  if (paymentStatus) baseFilter["payment.status"] = paymentStatus;
  if (paymentMethod) baseFilter["payment.method"] = paymentMethod;

  const returnStatus = normalizeEnumFilter(
    query.returnStatus,
    Object.values(ReturnRequest.STATUS),
    "Trạng thái đổi trả"
  );
  if (returnStatus) {
    // Approval now stores RETURNING; APPROVED only survives on legacy requests,
    // so the "approved" queue has to match both.
    const returnOrderIds = await ReturnRequest.distinct("order", {
      status: { $in: returnStatusesForFilter(returnStatus) },
    });
    baseFilter._id = { $in: returnOrderIds };
  }

  const status = normalizeEnumFilter(
    query.status,
    Object.values(Order.STATUS),
    "Trạng thái đơn hàng"
  );
  return {
    baseFilter,
    filter: { ...baseFilter, ...(status ? { status } : {}) },
    sort: buildAdminOrderSort(query),
  };
}

// Sorting is applied by the server before pagination (and to the CSV), so
// "oldest first" really means the oldest matching orders, not the oldest of
// the page already loaded.
const ADMIN_ORDER_SORT_FIELDS = Object.freeze(["placedAt", "totalAmount"]);

function buildAdminOrderSort(query = {}) {
  const field = String(query.sort || "placedAt").trim();
  if (!ADMIN_ORDER_SORT_FIELDS.includes(field)) {
    throw reportError("Trường sắp xếp không hợp lệ");
  }
  const order = String(query.order || "desc").trim().toLowerCase();
  if (!["asc", "desc"].includes(order)) {
    throw reportError("Chiều sắp xếp không hợp lệ");
  }
  const direction = order === "asc" ? 1 : -1;
  return { [field]: direction, _id: direction };
}

function csvCell(value) {
  let normalized = String(value ?? "").replace(/\r\n?/g, "\n");
  if (/^[=+\-@]/.test(normalized)) normalized = `'${normalized}`;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function phoneCsvCell(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\+?[0-9]{9,15}$/.test(normalized)) return csvCell(normalized);

  // Force Excel to treat the phone number as text so its leading zero is kept.
  return `"=""${normalized}"""`;
}

function vietnamDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  }).format(date);
}

function fullShippingAddress(address = {}) {
  return [address.address, address.ward, address.district, address.city]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

// `returnSummary` = { shown, count } from summarizeReturnsByOrder.
function orderCsvRow(order, returnSummary = { shown: null, count: 0 }) {
  const itemQuantity = (order.items || []).reduce(
    (total, item) => total + (Number(item.quantity) || 0),
    0
  );
  const itemSummary = (order.items || [])
    .map((item) => `${item.title || "Sản phẩm"} x${item.quantity || 1}`)
    .join("; ");
  const values = [
    order.orderCode,
    vietnamDateTime(order.placedAt || order.createdAt),
    order.shippingAddress?.fullName,
    order.user?.email,
    order.shippingAddress?.phone,
    order.status,
    order.payment?.status,
    order.payment?.method,
    order.payment?.transactionId,
    order.subtotal,
    order.discountAmount,
    order.shippingFee,
    order.totalAmount,
    [order.voucher?.code, order.shippingVoucher?.code]
      .filter(Boolean)
      .join(" + "),
    order.items?.length || 0,
    itemQuantity,
    itemSummary,
    order.shippingMethod,
    order.carrier || order.shipment?.provider,
    order.trackingNumber || order.shipment?.providerOrderCode,
    order.shipment?.providerStatus,
    fullShippingAddress(order.shippingAddress),
    // Appended so existing column positions stay put. Order-level refund and
    // after-sales refunds are separate columns so they are never summed twice.
    order.pointsDiscountAmount || 0,
    // "Hoàn cả đơn" only once the money has actually gone back (R-B8).
    order.status === Order.STATUS.REFUNDED ? order.payment?.refundAmount || 0 : 0,
    order.supportCompensation?.refundedAmount || 0,
    returnSummary.shown?.status || "",
    returnSummary.count,
    // Added last to keep earlier columns in place: still being refunded.
    order.status === Order.STATUS.REFUNDING ? order.payment?.refundAmount || 0 : 0,
  ];
  return `${values
    .map((value, index) => (index === 4 ? phoneCsvCell(value) : csvCell(value)))
    .join(",")}\r\n`;
}

const CSV_HEADERS = [
  "Mã đơn",
  "Ngày đặt",
  "Khách hàng",
  "Email",
  "Số điện thoại",
  "Trạng thái đơn",
  "Trạng thái thanh toán",
  "Phương thức thanh toán",
  "Mã giao dịch",
  "Tạm tính",
  "Giảm giá",
  "Phí vận chuyển",
  "Tổng thanh toán",
  "Voucher",
  "Số loại sản phẩm",
  "Tổng số lượng",
  "Sản phẩm",
  "Phương thức vận chuyển",
  "Đơn vị vận chuyển",
  "Mã vận đơn",
  "Trạng thái vận chuyển",
  "Địa chỉ giao hàng",
  "Giảm bằng điểm",
  "Hoàn cả đơn",
  "Đã hoàn hậu mãi",
  "Đổi trả (hồ sơ mới nhất khớp bộ lọc)",
  "Số hồ sơ đổi trả",
  "Đang hoàn cả đơn",
];

const CSV_BATCH_SIZE = 200;

async function writeCsvBatch(res, orders, returnStatus) {
  const returns = await ReturnRequest.find({ order: { $in: orders.map((order) => order._id) } })
    .select("order status createdAt")
    .lean();
  const byOrder = summarizeReturnsByOrder(returns, returnStatus);
  for (const order of orders) {
    if (!res.write(orderCsvRow(order, byOrder.get(String(order._id))))) {
      await once(res, "drain");
    }
  }
}

async function writeOrdersCsv(
  res,
  filter,
  sort = { placedAt: -1, _id: -1 },
  { returnStatus = "" } = {}
) {
  const filename = `bookshop-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.write(`\uFEFF${CSV_HEADERS.map(csvCell).join(",")}\r\n`);

  const cursor = Order.find(filter)
    .populate("user", "email")
    .sort(sort)
    .cursor();
  // Batched so return requests are looked up per page of orders, not per row.
  let batch = [];
  for await (const order of cursor) {
    batch.push(order);
    if (batch.length >= CSV_BATCH_SIZE) {
      await writeCsvBatch(res, batch, returnStatus);
      batch = [];
    }
  }
  if (batch.length) await writeCsvBatch(res, batch, returnStatus);
  res.end();
}

module.exports = {
  buildAdminOrderFilters,
  summarizeReturnsByOrder,
  orderCsvRow,
  parseVietnamCalendarDate,
  writeOrdersCsv,
};
