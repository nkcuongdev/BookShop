process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Book = require("../src/models/Book");
const Order = require("../src/models/Order");
const ReturnRequest = require("../src/models/ReturnRequest");
const SupportTicket = require("../src/models/SupportTicket");
const User = require("../src/models/User");
const {
  RETURN_WINDOW_DAYS,
  SHOP_FAULT_WINDOW_DAYS,
  getReturnEligibility,
} = require("../src/services/returnRequestService");

let mongo;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), Book.syncIndexes(), Order.syncIndexes()]);
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

async function sessionFor(user) {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { agent, csrf: response.body.data.csrfToken };
}

let seq = 0;
function makeUser(role = "user") {
  seq += 1;
  return User.create({
    name: role === "admin" ? `Agent ${seq}` : `Customer ${seq}`,
    email: `cat-${role}-${seq}@example.com`,
    password: "secure-password",
    role,
  });
}

/** A delivered order, `daysAgo` days ago. */
async function deliveredOrder(user, daysAgo = 1) {
  const book = await Book.create({
    title: "Consolidation Book",
    author: "A",
    price: 100000,
    category: "technology",
    stock: 20,
    status: "active",
  });
  const deliveredAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const order = await Order.create({
    user: user._id,
    items: [
      {
        book: book._id,
        title: book.title,
        category: "technology",
        price: 100000,
        quantity: 1,
        subtotal: 100000,
      },
    ],
    subtotal: 100000,
    totalAmount: 100000,
    status: Order.STATUS.DELIVERED,
    deliveredAt,
    placedAt: new Date(deliveredAt.getTime() - 24 * 60 * 60 * 1000),
    payment: { method: "COD", status: "PAID", paidAt: deliveredAt },
    shippingAddress: { fullName: user.name, phone: "0900000000", address: "1 Test Street" },
  });
  return { order, book };
}

// ── the overlap is gone ────────────────────────────────────────────────────

test("the category list is five non-overlapping problems", () => {
  assert.deepEqual(SupportTicket.CATEGORIES, [
    "NOT_RECEIVED",
    "ITEM_FAULT",
    "PAYMENT_ISSUE",
    "RETURN_REQUEST",
    "OTHER",
  ]);
  // The specific defects are no longer categories competing with RETURN.
  for (const removed of ["DAMAGED_ITEM", "WRONG_ITEM", "MISSING_ITEM", "DELIVERY", "PAYMENT", "REFUND", "RETURN"]) {
    assert.ok(!SupportTicket.CATEGORIES.includes(removed), `${removed} must no longer be a category`);
  }
});

test("a damaged item now has exactly one way in, and it carries the defect", async () => {
  const customer = await makeUser();
  const { order, book } = await deliveredOrder(customer);
  const session = await sessionFor(customer);

  const created = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "ITEM_FAULT",
      itemIssue: "DAMAGED",
      description: "Bìa sách bị rách khi tôi nhận hàng.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ticket = created.body.data.ticket;

  assert.equal(ticket.category, "ITEM_FAULT");
  assert.equal(ticket.requestDetails.itemIssue, "DAMAGED");
  assert.equal(ticket.requestDetails.returnReason, "DAMAGED");
  assert.equal(ticket.requestDetails.items.length, 1);
  assert.equal(ticket.priority, "HIGH");
  assert.equal(ticket.faultParty, "shop");
  assert.equal(ticket.returnShippingPaidBy, "shop");
  assert.equal(ticket.itemIssueLabel, "Sản phẩm bị hư hỏng");
});

test("an item-fault ticket must say what is actually wrong", async () => {
  const customer = await makeUser();
  const { order, book } = await deliveredOrder(customer);
  const session = await sessionFor(customer);

  const missingIssue = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "ITEM_FAULT",
      description: "Có vấn đề với sản phẩm này.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(missingIssue.status, 400);
  assert.equal(missingIssue.body.code, "ITEM_ISSUE_REQUIRED");

  const bogusIssue = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "ITEM_FAULT",
      itemIssue: "NOT_A_REAL_ISSUE",
      description: "Có vấn đề với sản phẩm này.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(bogusIssue.status, 400);
  assert.equal(bogusIssue.body.code, "ITEM_ISSUE_REQUIRED");
});

test("a goods complaint must identify the products it is about", async () => {
  const customer = await makeUser();
  const { order } = await deliveredOrder(customer);
  const session = await sessionFor(customer);

  const response = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "ITEM_FAULT",
      itemIssue: "MISSING_ITEM",
      description: "Đơn hàng của tôi bị thiếu sách.",
    });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, "RETURN_ITEMS_REQUIRED");
});

// ── separate windows for shop fault vs change of mind ──────────────────────

test("the two claim windows are 7 days for a change of mind and 30 for a shop fault", () => {
  assert.equal(RETURN_WINDOW_DAYS, 7);
  assert.equal(SHOP_FAULT_WINDOW_DAYS, 30);
});

test("a shop fault can still be claimed after the change-of-mind window closes", async () => {
  const customer = await makeUser();
  // 20 days after delivery: past the 7-day window, inside the 30-day one.
  const { order, book } = await deliveredOrder(customer, 20);
  const session = await sessionFor(customer);

  const changeOfMind = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "RETURN_REQUEST",
      description: "Tôi đổi ý và muốn trả lại sách.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(changeOfMind.status, 422);
  assert.equal(changeOfMind.body.code, "RETURN_WINDOW_EXPIRED");
  assert.match(changeOfMind.body.message, /7 ngày/);

  const shopFault = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "ITEM_FAULT",
      itemIssue: "WRONG_ITEM",
      description: "BookShop giao sai sách so với đơn tôi đặt.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(shopFault.status, 201, JSON.stringify(shopFault.body));
  assert.equal(shopFault.body.data.ticket.faultParty, "shop");
});

test("even a shop fault expires once the longer window closes", async () => {
  const customer = await makeUser();
  const { order, book } = await deliveredOrder(customer, 45);
  const session = await sessionFor(customer);

  const response = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "ITEM_FAULT",
      itemIssue: "DAMAGED",
      description: "Sách bị hư hỏng khi nhận.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, "RETURN_WINDOW_EXPIRED");
  assert.match(response.body.message, /30 ngày/);
});

test("eligibility reports the window and the fee payer per fault party", async () => {
  const customer = await makeUser();
  const { order } = await deliveredOrder(customer, 10);

  const asCustomer = getReturnEligibility(order, null, { faultParty: "customer" });
  assert.equal(asCustomer.eligible, false, "10 days is past the 7-day window");
  assert.equal(asCustomer.windowDays, 7);
  assert.equal(asCustomer.returnShippingPaidBy, "customer");

  const asShop = getReturnEligibility(order, null, { faultParty: "shop" });
  assert.equal(asShop.eligible, true, "10 days is inside the 30-day window");
  assert.equal(asShop.windowDays, 30);
  assert.equal(asShop.returnShippingPaidBy, "shop");

  // The original positional `now` argument still works for existing callers.
  const positional = getReturnEligibility(order, null, new Date());
  assert.equal(positional.windowDays, 7);
});

test("a change-of-mind return cannot borrow a defect reason to look like a shop fault", async () => {
  const customer = await makeUser();
  const { order, book } = await deliveredOrder(customer);
  const session = await sessionFor(customer);

  const response = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "RETURN_REQUEST",
      // Claiming a defect here would take the shop-fault treatment while
      // sitting in the customer-fault category.
      returnReason: "DAMAGED",
      itemIssue: "DAMAGED",
      description: "Tôi muốn trả lại sách này.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const ticket = response.body.data.ticket;
  assert.equal(ticket.requestDetails.returnReason, "OTHER");
  assert.equal(ticket.requestDetails.itemIssue, null);
  assert.equal(ticket.faultParty, "customer");
  assert.equal(ticket.returnShippingPaidBy, "customer");
});

test("the shop pays return shipping on a fault-driven return request", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order, book } = await deliveredOrder(customer);
  const session = await sessionFor(customer);
  const adminSession = await sessionFor(admin);

  const created = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({
      orderId: String(order._id),
      category: "ITEM_FAULT",
      itemIssue: "MISSING_ITEM",
      description: "Đơn hàng thiếu một quyển sách.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const resolved = await adminSession.agent
    .post(`/api/admin/support-tickets/${created.body.data.ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({
      type: "RETURN_REFUND",
      items: [{ bookId: String(book._id), quantity: 1 }],
      note: "Đã tiếp nhận, vui lòng gửi lại sản phẩm.",
    });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));

  const request = await ReturnRequest.findOne({ order: order._id }).lean();
  assert.equal(request.returnShippingPaidBy, "shop");
  assert.equal(request.reason, "MISSING_ITEM", "the stated defect flows into the return reason");
});

// ── migrating the tickets already in the database ──────────────────────────

test("legacy tickets are remapped onto the consolidated categories", async () => {
  const customer = await makeUser();
  const { order } = await deliveredOrder(customer);
  const base = {
    user: customer._id,
    order: order._id,
    description: "d",
    responseDueAt: new Date(),
    resolutionDueAt: new Date(),
    status: "OPEN",
    priority: "NORMAL",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  // Written through the driver so the old, now-invalid enum values persist.
  await SupportTicket.collection.insertMany([
    { ...base, ticketCode: "TK-OLD-1", subject: "s1", category: "DELIVERY" },
    { ...base, ticketCode: "TK-OLD-2", subject: "s2", category: "DAMAGED_ITEM" },
    { ...base, ticketCode: "TK-OLD-3", subject: "s3", category: "WRONG_ITEM" },
    { ...base, ticketCode: "TK-OLD-4", subject: "s4", category: "MISSING_ITEM" },
    { ...base, ticketCode: "TK-OLD-5", subject: "s5", category: "PAYMENT" },
    { ...base, ticketCode: "TK-OLD-6", subject: "s6", category: "REFUND" },
    { ...base, ticketCode: "TK-OLD-7", subject: "s7", category: "OTHER" },
    // A legacy RETURN with no defect recorded is a genuine change of mind.
    {
      ...base,
      ticketCode: "TK-OLD-8",
      subject: "s8",
      category: "RETURN",
      requestDetails: { returnReason: "OTHER", itemIssue: null, items: [] },
    },
    // A legacy RETURN that did record a defect belongs with the fault flow.
    {
      ...base,
      ticketCode: "TK-OLD-9",
      subject: "s9",
      category: "RETURN",
      requestDetails: { returnReason: "DAMAGED", itemIssue: null, items: [] },
    },
  ]);

  const result = await SupportTicket.migrateCategories();
  assert.ok(result.updated >= 9, `expected every legacy ticket to move, got ${result.updated}`);

  const byCode = Object.fromEntries(
    (await SupportTicket.find({}).lean()).map((ticket) => [ticket.ticketCode, ticket])
  );

  assert.equal(byCode["TK-OLD-1"].category, "NOT_RECEIVED");
  assert.equal(byCode["TK-OLD-1"].faultParty, "shop");

  assert.equal(byCode["TK-OLD-2"].category, "ITEM_FAULT");
  assert.equal(byCode["TK-OLD-2"].requestDetails.itemIssue, "DAMAGED");
  assert.equal(byCode["TK-OLD-3"].requestDetails.itemIssue, "WRONG_ITEM");
  assert.equal(byCode["TK-OLD-4"].requestDetails.itemIssue, "MISSING_ITEM");
  for (const code of ["TK-OLD-2", "TK-OLD-3", "TK-OLD-4"]) {
    assert.equal(byCode[code].faultParty, "shop");
  }

  assert.equal(byCode["TK-OLD-5"].category, "PAYMENT_ISSUE");
  assert.equal(byCode["TK-OLD-6"].category, "PAYMENT_ISSUE");
  assert.equal(byCode["TK-OLD-7"].category, "OTHER");

  assert.equal(byCode["TK-OLD-8"].category, "RETURN_REQUEST");
  assert.equal(byCode["TK-OLD-8"].faultParty, "customer");

  assert.equal(byCode["TK-OLD-9"].category, "ITEM_FAULT", "a recorded defect moves to the fault flow");
  assert.equal(byCode["TK-OLD-9"].requestDetails.itemIssue, "DAMAGED");
  assert.equal(byCode["TK-OLD-9"].faultParty, "shop");

  // Every ticket now holds a value the current schema accepts.
  for (const ticket of Object.values(byCode)) {
    assert.ok(
      SupportTicket.CATEGORIES.includes(ticket.category),
      `${ticket.ticketCode} still holds ${ticket.category}`
    );
  }
});

test("re-running the category migration changes nothing", async () => {
  const customer = await makeUser();
  const { order } = await deliveredOrder(customer);
  await SupportTicket.collection.insertOne({
    user: customer._id,
    order: order._id,
    ticketCode: "TK-IDEMPOTENT-1",
    subject: "s",
    description: "d",
    category: "DAMAGED_ITEM",
    status: "OPEN",
    priority: "NORMAL",
    responseDueAt: new Date(),
    resolutionDueAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await SupportTicket.migrateCategories();
  const afterFirst = await SupportTicket.findOne({ ticketCode: "TK-IDEMPOTENT-1" }).lean();
  assert.equal((await SupportTicket.migrateCategories()).updated, 0);
  const afterSecond = await SupportTicket.findOne({ ticketCode: "TK-IDEMPOTENT-1" }).lean();

  assert.equal(afterSecond.category, afterFirst.category);
  assert.equal(afterSecond.requestDetails.itemIssue, afterFirst.requestDetails.itemIssue);
  assert.equal(afterSecond.faultParty, afterFirst.faultParty);
});

test("a migrated legacy ticket can still be saved and served", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await deliveredOrder(customer);
  await SupportTicket.collection.insertOne({
    user: customer._id,
    order: order._id,
    ticketCode: "TK-SERVE-1",
    subject: "Sách bị hỏng",
    description: "d",
    category: "DAMAGED_ITEM",
    status: "OPEN",
    priority: "NORMAL",
    statusRank: 0,
    priorityRank: 1,
    responseDueAt: new Date(),
    resolutionDueAt: new Date(),
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await SupportTicket.migrateCategories();

  const ticket = await SupportTicket.findOne({ ticketCode: "TK-SERVE-1" });
  // A legacy row would fail enum validation on any save before the migration.
  await ticket.save();

  const adminSession = await sessionFor(admin);
  const listed = await adminSession.agent.get("/api/admin/support-tickets?status=OPEN");
  assert.equal(listed.status, 200);
  const served = listed.body.data.tickets.find((item) => item.ticketCode === "TK-SERVE-1");
  assert.ok(served, "the migrated ticket is visible in the admin queue");
  assert.equal(served.categoryLabel, "Hàng bị lỗi, sai hoặc thiếu");
  assert.equal(served.itemIssueLabel, "Sản phẩm bị hư hỏng");
});
