const { once } = require("events");
const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const SupportTicket = require("../models/SupportTicket");
const { parseVietnamCalendarDate } = require("./orderReportService");

// Gross-profit reporting from the business side of the ledger.
//
// This is deliberately NOT inventoryService.getMovementReport. That one values
// every stock movement at the moving-average cost held in StockLedger and
// answers "what did the warehouse do". This one pairs revenue with the cost
// snapshot frozen onto each order item and answers "what did we earn".
//
// Only DELIVERED orders count: revenue is recognised when the goods reach the
// customer, matching the point at which Order sets deliveredAt. Anything
// cancelled, failed or still in flight contributes nothing.
//
// Returns are netted off afterwards. A return refunds the customer and puts the
// goods back on the shelf, so the revenue and the cost of the returned units
// both have to come back out of the period the sale was booked in.

const REVENUE_STATUS = "DELIVERED";

// A return only reverses a sale once the goods are actually back. PENDING and
// RETURNING are still in flight, and REJECTED never comes back at all.
const SETTLED_RETURN_STATUSES = ["RECEIVED", "CLOSED"];

const GROUP_BY = Object.freeze({
  DAY: "day",
  BOOK: "book",
  CATEGORY: "category",
});

const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

function reportError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeGroupBy(value) {
  const normalized = String(value || GROUP_BY.DAY)
    .trim()
    .toLowerCase();
  if (!Object.values(GROUP_BY).includes(normalized)) {
    throw reportError("Kiểu nhóm báo cáo không hợp lệ");
  }
  return normalized;
}

/**
 * Date-window parsing. Uses the same Vietnam-calendar helper the order report
 * uses so both screens agree on where a day starts and ends.
 */
function parseRange(query = {}) {
  const fromValue = String(query.from || "").trim();
  const toValue = String(query.to || "").trim();
  const from = fromValue ? parseVietnamCalendarDate(fromValue, false) : null;
  const to = toValue ? parseVietnamCalendarDate(toValue, true) : null;
  if (fromValue && !from) throw reportError("Ngày bắt đầu không hợp lệ");
  if (toValue && !to) throw reportError("Ngày kết thúc không hợp lệ");
  if (from && to && from > to) {
    throw reportError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
  }
  return { from, to };
}

function deliveredFilter({ from, to }, prefix = "") {
  const statusKey = prefix ? `${prefix}status` : "status";
  const dateKey = prefix ? `${prefix}deliveredAt` : "deliveredAt";
  const filter = { [statusKey]: REVENUE_STATUS };
  if (from || to) {
    filter[dateKey] = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }
  return filter;
}

function margin(grossProfit, revenue) {
  if (!revenue) return 0;
  return Math.round((grossProfit / revenue) * 10000) / 100;
}

// Order-level money (discount, shipping) is charged per order, not per line.
// Spreading it across lines would invent precision the data does not have, so
// grouped rows carry item-level revenue and cost only and the order-level
// figures are reported in the period totals, where they belong.
const ITEM_REVENUE = { $multiply: ["$items.price", "$items.quantity"] };
const ITEM_COST = {
  $multiply: [{ $ifNull: ["$items.costPrice", 0] }, "$items.quantity"],
};

function dayKeyExpr(dateField) {
  return {
    $dateToString: {
      format: "%Y-%m-%d",
      date: dateField,
      timezone: VIETNAM_TIMEZONE,
    },
  };
}

function saleGroupId(groupBy) {
  if (groupBy === GROUP_BY.BOOK) return "$items.book";
  if (groupBy === GROUP_BY.CATEGORY) return "$items.category";
  return dayKeyExpr("$deliveredAt");
}

function returnGroupId(groupBy) {
  if (groupBy === GROUP_BY.BOOK) return "$items.book";
  if (groupBy === GROUP_BY.CATEGORY) return "$sold.category";
  return dayKeyExpr("$order.deliveredAt");
}

/**
 * Sales side of the report, grouped as requested.
 */
function aggregateSales(groupBy, range) {
  return Order.aggregate([
    { $match: deliveredFilter(range) },
    { $unwind: "$items" },
    {
      $group: {
        _id: saleGroupId(groupBy),
        label: { $first: "$items.title" },
        revenue: { $sum: ITEM_REVENUE },
        cost: { $sum: ITEM_COST },
        units: { $sum: "$items.quantity" },
        orders: { $addToSet: "$_id" },
      },
    },
    {
      $project: {
        label: 1,
        revenue: 1,
        cost: 1,
        units: 1,
        orderCount: { $size: "$orders" },
      },
    },
  ]);
}

/**
 * Revenue and cost of the units that came back, keyed the same way as the sales
 * aggregation so the two can be subtracted row by row.
 *
 * Cost lives on the order item rather than the return item, so this walks back
 * into the originating order to price returned units at what they cost us.
 */
async function aggregateReturns(groupBy, range) {
  const rows = await ReturnRequest.aggregate([
    { $match: { status: { $in: SETTLED_RETURN_STATUSES } } },
    {
      $lookup: {
        from: Order.collection.name,
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: "$order" },
    // Net a return off the period its sale was booked in, so a period total
    // never shows revenue whose matching return landed somewhere else.
    { $match: deliveredFilter(range, "order.") },
    { $unwind: "$items" },
    {
      // Pull the sold line back out of the order to read its cost snapshot and
      // category. $filter over the already-joined order avoids a second lookup.
      $addFields: {
        sold: {
          $first: {
            $filter: {
              input: "$order.items",
              as: "sold",
              cond: { $eq: ["$$sold.book", "$items.book"] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: returnGroupId(groupBy),
        revenue: {
          $sum: { $multiply: ["$items.unitPrice", "$items.quantity"] },
        },
        // Only goods that went back on the shelf reverse their cost. A return
        // booked DAMAGED is not resaleable: the money came back to the customer
        // but the stock did not come back to us, so the cost of those units
        // stays spent and is reported separately as a write-off.
        cost: {
          $sum: {
            $cond: [
              { $eq: ["$inventoryDisposition", "DAMAGED"] },
              0,
              {
                $multiply: [
                  { $ifNull: ["$sold.costPrice", 0] },
                  "$items.quantity",
                ],
              },
            ],
          },
        },
        damagedCost: {
          $sum: {
            $cond: [
              { $eq: ["$inventoryDisposition", "DAMAGED"] },
              {
                $multiply: [
                  { $ifNull: ["$sold.costPrice", 0] },
                  "$items.quantity",
                ],
              },
              0,
            ],
          },
        },
        units: { $sum: "$items.quantity" },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id ?? ""), row]));
}

/**
 * Shipping and discount attached to orders that were refunded in full.
 *
 * `aggregateOrderTotals` books every delivered order's shipping fee as income
 * and its discount as a cost. When the whole order is handed back, the customer
 * gets all of it returned - fee included - so leaving both in the bottom line
 * lets a fully-refunded order still show a profit purely from the gap between
 * its shipping fee and its discount. Reversing them here cancels that out.
 *
 * A partially-returned order is deliberately excluded: the delivery still
 * happened and only the returned lines are refunded.
 */
async function aggregateFullyRefundedTotals(range) {
  const rows = await ReturnRequest.aggregate([
    { $match: { status: { $in: SETTLED_RETURN_STATUSES } } },
    {
      $lookup: {
        from: Order.collection.name,
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: "$order" },
    { $match: deliveredFilter(range, "order.") },
    {
      // Every ordered line came back in full, quantity for quantity.
      $addFields: {
        fullyReturned: {
          $allElementsTrue: {
            $map: {
              input: "$order.items",
              as: "sold",
              in: {
                $let: {
                  vars: {
                    back: {
                      $first: {
                        $filter: {
                          input: "$items",
                          as: "back",
                          cond: { $eq: ["$$back.book", "$$sold.book"] },
                        },
                      },
                    },
                  },
                  in: { $eq: [{ $ifNull: ["$$back.quantity", 0] }, "$$sold.quantity"] },
                },
              },
            },
          },
        },
      },
    },
    { $match: { fullyReturned: true } },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        discountAmount: {
          $sum: {
            $add: [
              { $ifNull: ["$order.discountAmount", 0] },
              { $ifNull: ["$order.pointsDiscountAmount", 0] },
            ],
          },
        },
        shippingFee: { $sum: { $ifNull: ["$order.shippingFee", 0] } },
      },
    },
  ]);
  const row = rows[0];
  return {
    orderCount: row?.orderCount || 0,
    discountAmount: Math.round(row?.discountAmount || 0),
    shippingFee: Math.round(row?.shippingFee || 0),
  };
}

/**
 * Money refunded through support tickets in the period.
 *
 * These are goodwill refunds and compensation booked against an order without a
 * return document, so nothing in the sales or returns aggregation sees them -
 * yet the cash genuinely left the business and has to come off the bottom line.
 */
async function aggregateSupportCompensation(range) {
  const [row] = await SupportTicket.aggregate([
    {
      $match: {
        "resolution.type": {
          $in: ["PARTIAL_REFUND", "LOST_IN_TRANSIT_REFUND"],
        },
        "resolution.status": "REFUND_COMPLETED",
      },
    },
    {
      $lookup: {
        from: Order.collection.name,
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: "$order" },
    { $match: deliveredFilter(range, "order.") },
    {
      $group: {
        _id: null,
        refundedAmount: { $sum: { $ifNull: ["$resolution.amount", 0] } },
      },
    },
  ]);
  return Math.round(row?.refundedAmount || 0);
}

/**
 * Order-level money for the period: what was discounted and what shipping was
 * charged. These sit outside the per-line margin but belong in the bottom line.
 */
async function aggregateOrderTotals(range) {
  const [row] = await Order.aggregate([
    { $match: deliveredFilter(range) },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        discountAmount: {
          $sum: {
            $add: [
              { $ifNull: ["$discountAmount", 0] },
              { $ifNull: ["$pointsDiscountAmount", 0] },
            ],
          },
        },
        shippingFee: { $sum: { $ifNull: ["$shippingFee", 0] } },
        totalAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
      },
    },
  ]);
  return {
    orderCount: row?.orderCount || 0,
    discountAmount: Math.round(row?.discountAmount || 0),
    shippingFee: Math.round(row?.shippingFee || 0),
    totalAmount: Math.round(row?.totalAmount || 0),
  };
}

/**
 * How much of the reported cost is missing a snapshot. Orders placed before
 * costPrice was captured report a zero cost, which would read as 100% margin;
 * surfacing the count lets the UI say so instead of lying quietly.
 */
async function getCostCoverage(range) {
  const [row] = await Order.aggregate([
    { $match: deliveredFilter(range) },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        itemsTotal: { $sum: 1 },
        itemsMissingCost: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ["$items.costPrice", 0] }, 0] }, 0, 1],
          },
        },
        revenueMissingCost: {
          $sum: {
            $cond: [
              { $gt: [{ $ifNull: ["$items.costPrice", 0] }, 0] },
              0,
              ITEM_REVENUE,
            ],
          },
        },
      },
    },
  ]);
  return {
    itemsTotal: row?.itemsTotal || 0,
    itemsMissingCost: row?.itemsMissingCost || 0,
    revenueMissingCost: Math.round(row?.revenueMissingCost || 0),
  };
}

function labelFor(groupBy, key, saleRow) {
  if (groupBy === GROUP_BY.DAY) return key;
  if (groupBy === GROUP_BY.CATEGORY) return key || "Chưa phân loại";
  return saleRow?.label || "Sách đã xoá";
}

function buildRows(groupBy, sales, returnsByKey) {
  const salesByKey = new Map(sales.map((row) => [String(row._id ?? ""), row]));
  const keys = new Set([...salesByKey.keys(), ...returnsByKey.keys()]);

  const rows = [];
  for (const key of keys) {
    const sale = salesByKey.get(key);
    const back = returnsByKey.get(key);
    const returnedRevenue = Math.round(back?.revenue || 0);
    const returnedCost = Math.round(back?.cost || 0);
    // Cost of returned units that could not be resold. It is not reversed out
    // of `cost` - the goods are gone - so it stays in the period's cost of
    // sales and is reported on its own line as a write-off.
    const damagedCost = Math.round(back?.damagedCost || 0);
    const revenue = Math.round(sale?.revenue || 0) - returnedRevenue;
    const cost = Math.round(sale?.cost || 0) - returnedCost;
    const grossProfit = revenue - cost;
    rows.push({
      key,
      label: labelFor(groupBy, key, sale),
      revenue,
      cost,
      grossProfit,
      margin: margin(grossProfit, revenue),
      units: (sale?.units || 0) - (back?.units || 0),
      orderCount: sale?.orderCount || 0,
      returnedRevenue,
      returnedCost,
      damagedCost,
    });
  }

  rows.sort((a, b) =>
    groupBy === GROUP_BY.DAY
      ? a.key.localeCompare(b.key)
      : b.grossProfit - a.grossProfit
  );
  return rows;
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + (row[key] || 0), 0);
}

/**
 * The report. Revenue, cost of goods sold and gross profit over a period,
 * grouped by day, book or category, with settled returns netted off.
 */
async function getProfitReport(query = {}) {
  const groupBy = normalizeGroupBy(query.groupBy);
  const range = parseRange(query);

  const [
    sales,
    returnsByKey,
    orderTotals,
    refundedTotals,
    supportRefunded,
    costCoverage,
  ] = await Promise.all([
    aggregateSales(groupBy, range),
    aggregateReturns(groupBy, range),
    aggregateOrderTotals(range),
    aggregateFullyRefundedTotals(range),
    aggregateSupportCompensation(range),
    getCostCoverage(range),
  ]);

  const rows = buildRows(groupBy, sales, returnsByKey);
  const revenue = sumRows(rows, "revenue");
  const cost = sumRows(rows, "cost");
  const grossProfit = revenue - cost;

  return {
    groupBy,
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to ? range.to.toISOString() : null,
    },
    rows,
    totals: {
      revenue,
      cost,
      grossProfit,
      margin: margin(grossProfit, revenue),
      units: sumRows(rows, "units"),
      returnedRevenue: sumRows(rows, "returnedRevenue"),
      returnedCost: sumRows(rows, "returnedCost"),
      // Cost of returned goods that could not be resold. Already inside `cost`;
      // broken out so the write-off is visible rather than buried.
      damagedCost: sumRows(rows, "damagedCost"),
      ...orderTotals,
      // Shipping and discount belonging to orders handed back in full. Both are
      // included in the orderTotals above and both are refunded to the
      // customer, so they are reversed out of the bottom line below.
      refundedOrderCount: refundedTotals.orderCount,
      refundedShippingFee: refundedTotals.shippingFee,
      refundedDiscountAmount: refundedTotals.discountAmount,
      // Goodwill refunds paid through support tickets. No return document
      // exists for these, so nothing above accounts for the cash going out.
      supportRefundedAmount: supportRefunded,
      // Gross profit, less the discounts given, plus the shipping collected -
      // then with the shipping and discount of fully refunded orders unwound
      // and support compensation taken off, so refunded money never reads as
      // profit.
      netProfit:
        grossProfit -
        (orderTotals.discountAmount - refundedTotals.discountAmount) +
        (orderTotals.shippingFee - refundedTotals.shippingFee) -
        supportRefunded,
    },
    costCoverage,
  };
}

function csvCell(value) {
  let normalized = String(value ?? "").replace(/\r\n?/g, "\n");
  if (/^[=+\-@]/.test(normalized)) normalized = `'${normalized}`;
  return `"${normalized.replace(/"/g, '""')}"`;
}

const GROUP_HEADERS = {
  [GROUP_BY.DAY]: "Ngày",
  [GROUP_BY.BOOK]: "Sách",
  [GROUP_BY.CATEGORY]: "Danh mục",
};

async function writeProfitCsv(res, query = {}) {
  const report = await getProfitReport(query);
  const filename = `bookshop-profit-${new Date().toISOString().slice(0, 10)}.csv`;
  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");

  const headers = [
    GROUP_HEADERS[report.groupBy],
    "Doanh thu",
    "Giá vốn",
    "Lợi nhuận gộp",
    "Biên lợi nhuận (%)",
    "Số lượng",
    "Số đơn",
    "Doanh thu trả hàng",
    "Giá vốn trả hàng",
    "Giá vốn hàng trả hỏng",
  ];
  res.write(`\uFEFF${headers.map(csvCell).join(",")}\r\n`);

  for (const row of report.rows) {
    const values = [
      row.label,
      row.revenue,
      row.cost,
      row.grossProfit,
      row.margin,
      row.units,
      row.orderCount,
      row.returnedRevenue,
      row.returnedCost,
      row.damagedCost,
    ];
    if (!res.write(`${values.map(csvCell).join(",")}\r\n`)) {
      await once(res, "drain");
    }
  }
  res.end();
}

module.exports = {
  GROUP_BY,
  getProfitReport,
  writeProfitCsv,
};
