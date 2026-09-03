process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Book = require("../src/models/Book");
const Order = require("../src/models/Order");
const ReturnRequest = require("../src/models/ReturnRequest");
const User = require("../src/models/User");
const profitReportService = require("../src/services/profitReportService");

let mongoServer;
let userId;
let bookId;
let otherBookId;

// Deliberately mid-month and mid-day in Vietnam time, so a UTC-vs-VN slip in
// the day bucketing shows up as a wrong date key rather than passing by luck.
const DELIVERED_AT = new Date("2026-03-15T04:00:00.000Z"); // 11:00 VN, 15 Mar

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
  const user = await User.create({
    name: "Người mua",
    email: "buyer@example.com",
    password: "hashed-password",
  });
  userId = user._id;
  const [book, other] = await Book.create([
    {
      title: "Sách A",
      author: "Tác giả",
      price: 100000,
      category: "van-hoc",
      costPrice: 60000,
      stock: 10,
    },
    {
      title: "Sách B",
      author: "Tác giả",
      price: 50000,
      category: "kinh-te",
      costPrice: 20000,
      stock: 10,
    },
  ]);
  bookId = book._id;
  otherBookId = other._id;
});

function orderPayload(overrides = {}) {
  const items = overrides.items || [
    {
      book: bookId,
      title: "Sách A",
      category: "van-hoc",
      price: 100000,
      costPrice: 60000,
      quantity: 2,
      subtotal: 200000,
    },
  ];
  const subtotal = items.reduce((total, item) => total + item.subtotal, 0);
  return {
    user: userId,
    items,
    subtotal,
    discountAmount: 0,
    shippingFee: 0,
    totalAmount: subtotal,
    status: "DELIVERED",
    deliveredAt: DELIVERED_AT,
    placedAt: DELIVERED_AT,
    shippingAddress: {
      fullName: "Người mua",
      phone: "0900000000",
      address: "1 Đường Test",
    },
    ...overrides,
  };
}

test("gross profit is revenue less the cost snapshot on each item", async () => {
  await Order.create(orderPayload());

  const report = await profitReportService.getProfitReport({});

  assert.equal(report.totals.revenue, 200000);
  assert.equal(report.totals.cost, 120000);
  assert.equal(report.totals.grossProfit, 80000);
  assert.equal(report.totals.margin, 40);
  assert.equal(report.totals.units, 2);
});

test("only DELIVERED orders are counted", async () => {
  await Order.create([
    orderPayload(),
    orderPayload({ status: "CANCELLED", deliveredAt: null }),
    orderPayload({ status: "PROCESSING", deliveredAt: null }),
  ]);

  const report = await profitReportService.getProfitReport({});

  assert.equal(report.totals.revenue, 200000);
  assert.equal(report.totals.orderCount, 1);
});

test("day grouping buckets by the Vietnam calendar date", async () => {
  await Order.create(orderPayload());

  const report = await profitReportService.getProfitReport({ groupBy: "day" });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].label, "2026-03-15");
});

test("a settled return removes both its revenue and its cost", async () => {
  const order = await Order.create(orderPayload());
  await ReturnRequest.create({
    order: order._id,
    user: userId,
    items: [
      {
        book: bookId,
        title: "Sách A",
        unitPrice: 100000,
        orderedQuantity: 2,
        quantity: 1,
      },
    ],
    reason: "DAMAGED",
    details: "Sách bị rách bìa khi nhận hàng",
    status: "RECEIVED",
  });

  const report = await profitReportService.getProfitReport({});

  // One of two units came back: revenue 200k-100k, cost 120k-60k.
  assert.equal(report.totals.revenue, 100000);
  assert.equal(report.totals.cost, 60000);
  assert.equal(report.totals.grossProfit, 40000);
  assert.equal(report.totals.returnedRevenue, 100000);
  assert.equal(report.totals.returnedCost, 60000);
});

test("an unsettled return does not reverse the sale yet", async () => {
  const order = await Order.create(orderPayload());
  await ReturnRequest.create({
    order: order._id,
    user: userId,
    items: [
      {
        book: bookId,
        title: "Sách A",
        unitPrice: 100000,
        orderedQuantity: 2,
        quantity: 1,
      },
    ],
    reason: "DAMAGED",
    details: "Mới gửi yêu cầu, hàng chưa quay về kho",
    status: "PENDING",
  });

  const report = await profitReportService.getProfitReport({});

  assert.equal(report.totals.revenue, 200000);
  assert.equal(report.totals.returnedRevenue, 0);
});

test("book grouping splits revenue and cost per title", async () => {
  await Order.create(
    orderPayload({
      items: [
        {
          book: bookId,
          title: "Sách A",
          category: "van-hoc",
          price: 100000,
          costPrice: 60000,
          quantity: 1,
          subtotal: 100000,
        },
        {
          book: otherBookId,
          title: "Sách B",
          category: "kinh-te",
          price: 50000,
          costPrice: 20000,
          quantity: 2,
          subtotal: 100000,
        },
      ],
    })
  );

  const report = await profitReportService.getProfitReport({ groupBy: "book" });

  assert.equal(report.rows.length, 2);
  // Sorted by gross profit: Sách B earns 60k, Sách A earns 40k.
  assert.equal(report.rows[0].label, "Sách B");
  assert.equal(report.rows[0].grossProfit, 60000);
  assert.equal(report.rows[1].label, "Sách A");
  assert.equal(report.rows[1].grossProfit, 40000);
});

test("category grouping aggregates across books", async () => {
  await Order.create(orderPayload());

  const report = await profitReportService.getProfitReport({
    groupBy: "category",
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].label, "van-hoc");
  assert.equal(report.rows[0].grossProfit, 80000);
});

test("the date range excludes orders delivered outside it", async () => {
  await Order.create([
    orderPayload(),
    orderPayload({ deliveredAt: new Date("2026-01-10T04:00:00.000Z") }),
  ]);

  const report = await profitReportService.getProfitReport({
    from: "2026-03-01",
    to: "2026-03-31",
  });

  assert.equal(report.totals.orderCount, 1);
  assert.equal(report.totals.revenue, 200000);
});

test("an invalid date is rejected rather than silently ignored", async () => {
  await assert.rejects(
    () => profitReportService.getProfitReport({ from: "2026-13-45" }),
    (error) => error.statusCode === 400
  );
});

test("an invalid groupBy is rejected", async () => {
  await assert.rejects(
    () => profitReportService.getProfitReport({ groupBy: "supplier" }),
    (error) => error.statusCode === 400
  );
});

test("items without a cost snapshot are reported as missing coverage", async () => {
  await Order.create(
    orderPayload({
      items: [
        {
          book: bookId,
          title: "Sách A",
          category: "van-hoc",
          price: 100000,
          costPrice: 0,
          quantity: 1,
          subtotal: 100000,
        },
      ],
    })
  );

  const report = await profitReportService.getProfitReport({});

  assert.equal(report.costCoverage.itemsTotal, 1);
  assert.equal(report.costCoverage.itemsMissingCost, 1);
  assert.equal(report.costCoverage.revenueMissingCost, 100000);
});

test("net profit accounts for order-level discount and shipping", async () => {
  await Order.create(
    orderPayload({
      discountAmount: 20000,
      shippingFee: 30000,
      totalAmount: 210000,
    })
  );

  const report = await profitReportService.getProfitReport({});

  assert.equal(report.totals.grossProfit, 80000);
  // 80k gross - 20k discount + 30k shipping collected.
  assert.equal(report.totals.netProfit, 90000);
});
