process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Order = require("../src/models/Order");
const ReturnRequest = require("../src/models/ReturnRequest");
const User = require("../src/models/User");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Order.syncIndexes(),
    ReturnRequest.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
});

async function adminSession() {
  const admin = await User.create({
    name: "Report Admin",
    email: "report-admin@example.com",
    password: "secure-password",
    role: "admin",
  });
  const agent = supertest.agent(app);
  const login = await agent.post("/api/auth/login").send({
    email: admin.email,
    password: "secure-password",
  });
  assert.equal(login.status, 200);
  return { agent, admin };
}

async function createOrder(userId, overrides = {}) {
  const price = overrides.totalAmount || 120_000;
  return Order.create({
    user: userId,
    items: [
      {
        book: new mongoose.Types.ObjectId(),
        title: overrides.title || "Sách đối soát",
        author: "BookShop",
        price,
        quantity: 1,
        subtotal: price,
      },
    ],
    subtotal: price,
    shippingFee: 0,
    discountAmount: 0,
    totalAmount: price,
    shippingAddress: {
      fullName: overrides.customerName || "Khách báo cáo",
      phone: overrides.phone || "0900000000",
      address: "1 Đường Sách",
      city: "TP. Hồ Chí Minh",
    },
    status: overrides.status || Order.STATUS.PAID,
    placedAt: overrides.placedAt,
    payment: {
      method: overrides.paymentMethod || Order.PAYMENT_METHOD.VNPAY,
      status: overrides.paymentStatus || Order.PAYMENT_STATUS.PAID,
      transactionId: overrides.transactionId || "TX-REPORT-1",
    },
    ...overrides.document,
  });
}

test("admin order report filters by Vietnam order date and payment fields", async () => {
  const { agent } = await adminSession();
  const customer = await User.create({
    name: "Report Customer",
    email: "report-customer@example.com",
    password: "secure-password",
  });
  const matching = await createOrder(customer._id, {
    placedAt: new Date("2026-07-31T17:00:00.000Z"),
    customerName: "Khách phù hợp",
  });
  await createOrder(customer._id, {
    placedAt: new Date("2026-07-31T16:59:59.999Z"),
    paymentMethod: Order.PAYMENT_METHOD.COD,
    paymentStatus: Order.PAYMENT_STATUS.UNPAID,
    status: Order.STATUS.PENDING,
    customerName: "Khách ngoài khoảng",
  });

  const response = await agent.get(
    "/api/admin/orders?dateFrom=2026-08-01&dateTo=2026-08-01&paymentMethod=VNPAY&paymentStatus=PAID"
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.orders.length, 1);
  assert.equal(String(response.body.data.orders[0]._id), String(matching._id));
  assert.equal(response.body.data.pagination.total, 1);
  assert.equal(response.body.data.statusCounts.all, 1);
});

function createReturnRequest(order, status) {
  return ReturnRequest.create({
    order: order._id,
    user: order.user,
    items: [
      {
        book: order.items[0].book,
        title: order.items[0].title,
        unitPrice: order.items[0].price,
        orderedQuantity: 1,
        quantity: 1,
      },
    ],
    reason: "DAMAGED",
    details: "Sách bị rách bìa khi nhận hàng",
    status,
  });
}

test("approved return filter also finds requests approved into RETURNING", async () => {
  const { agent } = await adminSession();
  const customer = await User.create({
    name: "Return Customer",
    email: "return-customer@example.com",
    password: "secure-password",
  });
  const delivered = { status: Order.STATUS.DELIVERED };
  const legacy = await createOrder(customer._id, { ...delivered, customerName: "Legacy" });
  const current = await createOrder(customer._id, { ...delivered, customerName: "Current" });
  const received = await createOrder(customer._id, { ...delivered, customerName: "Received" });
  await createReturnRequest(legacy, ReturnRequest.STATUS.APPROVED);
  await createReturnRequest(current, ReturnRequest.STATUS.RETURNING);
  await createReturnRequest(received, ReturnRequest.STATUS.RECEIVED);

  const approved = await agent.get("/api/admin/orders?returnStatus=APPROVED");
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.deepEqual(
    approved.body.data.orders.map((order) => String(order._id)).sort(),
    [String(legacy._id), String(current._id)].sort()
  );

  const receivedOnly = await agent.get("/api/admin/orders?returnStatus=RECEIVED");
  assert.equal(receivedOnly.status, 200, JSON.stringify(receivedOnly.body));
  assert.deepEqual(
    receivedOnly.body.data.orders.map((order) => String(order._id)),
    [String(received._id)]
  );
});

test("the list badges the return request that matched the filter", async () => {
  const { agent } = await adminSession();
  const customer = await User.create({
    name: "Badge Customer",
    email: "badge-customer@example.com",
    password: "secure-password",
  });
  const order = await createOrder(customer._id, { status: Order.STATUS.DELIVERED });
  const older = await createReturnRequest(order, ReturnRequest.STATUS.PENDING);
  await ReturnRequest.updateOne(
    { _id: older._id },
    { $set: { createdAt: new Date(Date.now() - 60_000) } }
  );
  await createReturnRequest(order, ReturnRequest.STATUS.REJECTED);

  const pending = await agent.get("/api/admin/orders?returnStatus=PENDING");
  assert.equal(pending.status, 200, JSON.stringify(pending.body));
  assert.equal(pending.body.data.orders.length, 1);
  assert.equal(pending.body.data.orders[0].returnRequest.status, "PENDING");
  assert.equal(pending.body.data.orders[0].returnRequestCount, 2);

  const unfiltered = await agent.get("/api/admin/orders");
  assert.equal(unfiltered.body.data.orders[0].returnRequest.status, "REJECTED");
});

test("CSV export streams every matching order and protects spreadsheet cells", async () => {
  const { agent } = await adminSession();
  const customer = await User.create({
    name: "CSV Customer",
    email: "csv-customer@example.com",
    password: "secure-password",
  });
  await createOrder(customer._id, {
    placedAt: new Date("2026-08-10T03:00:00.000Z"),
    customerName: "=HYPERLINK(\"https://bad.example\")",
    phone: "0901234567",
    transactionId: "TX-INCLUDED",
    title: "Sách, có dấu phẩy",
  });
  await createOrder(customer._id, {
    placedAt: new Date("2026-08-10T04:00:00.000Z"),
    paymentMethod: Order.PAYMENT_METHOD.COD,
    paymentStatus: Order.PAYMENT_STATUS.UNPAID,
    status: Order.STATUS.PENDING,
    transactionId: "TX-EXCLUDED",
  });

  const response = await agent.get(
    "/api/admin/orders/export.csv?dateFrom=2026-08-10&dateTo=2026-08-10&paymentMethod=VNPAY&paymentStatus=PAID"
  );
  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /text\/csv/);
  assert.match(response.headers["content-disposition"], /bookshop-orders-/);
  assert.ok(response.text.startsWith("\uFEFF"));
  assert.match(response.text, /Mã đơn/);
  assert.match(response.text, /TX-INCLUDED/);
  assert.doesNotMatch(response.text, /TX-EXCLUDED/);
  assert.match(response.text, /'=HYPERLINK/);
  assert.match(response.text, /Sách, có dấu phẩy/);
  assert.match(response.text, /"=""0901234567"""/);
});

test("order report rejects invalid or reversed calendar dates", async () => {
  const { agent } = await adminSession();

  const invalid = await agent.get("/api/admin/orders?dateFrom=2026-02-30");
  assert.equal(invalid.status, 400);

  const reversed = await agent.get(
    "/api/admin/orders/export.csv?dateFrom=2026-08-11&dateTo=2026-08-10"
  );
  assert.equal(reversed.status, 400);
  assert.match(reversed.body.message, /Ngày bắt đầu/);
});
