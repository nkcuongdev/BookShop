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
const Notification = require("../src/models/Notification");
const Order = require("../src/models/Order");
const SupportTicket = require("../src/models/SupportTicket");
const User = require("../src/models/User");
const { autoResolveStaleTickets } = require("../src/services/supportResolutionService");

let mongo;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Book.syncIndexes(),
    Order.syncIndexes(),
    SupportTicket.syncIndexes(),
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

async function sessionFor(user) {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { agent, csrf: response.body.data.csrfToken };
}

let emailSeq = 0;
function makeUser(role = "user") {
  emailSeq += 1;
  return User.create({
    name: role === "admin" ? `Agent ${emailSeq}` : `Customer ${emailSeq}`,
    email: `policy-${role}-${emailSeq}@example.com`,
    password: "secure-password",
    role,
  });
}

async function makeOrder(user, overrides = {}) {
  const book = await Book.create({
    title: "Policy Book",
    author: "A",
    price: 150000,
    category: "technology",
    stock: 50,
    status: "active",
  });
  const order = await Order.create({
    user: user._id,
    items: [
      {
        book: book._id,
        title: book.title,
        category: "technology",
        price: 150000,
        quantity: 1,
        subtotal: 150000,
      },
    ],
    subtotal: 150000,
    totalAmount: 150000,
    shippingAddress: { fullName: user.name, phone: "0900000000", address: "1 Test Street" },
    ...overrides,
  });
  return { order, book };
}

// ── #1 closing a ticket whose resolution reached a terminal state ───────────

test("a guidance-resolved ticket can be closed once the work is done", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);

  const created = await customerSession.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", customerSession.csrf)
    .send({ orderId: String(order._id), category: "OTHER", description: "Cho tôi hỏi về đơn hàng" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ticketId = created.body.data.ticket._id;

  const guidance = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "GUIDANCE", note: "Đơn của bạn đang được xử lý bình thường." });
  assert.equal(guidance.status, 200, JSON.stringify(guidance.body));
  assert.equal(guidance.body.data.ticket.resolution.status, "COMPLETED");

  const closed = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "CLOSED" });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.data.ticket.status, "CLOSED");
  assert.ok(closed.body.data.ticket.closedAt);
});

test("a permanently failed resolution no longer wedges the ticket open", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const ticket = await SupportTicket.create({
    user: customer._id,
    order: order._id,
    category: "PAYMENT_ISSUE",
    subject: "Hoàn tiền lỗi",
    description: "Hoàn tiền không thành công",
    resolution: {
      type: "PARTIAL_REFUND",
      status: "REFUND_FAILED",
      items: [],
      createdBy: admin._id,
    },
  });
  const adminSession = await sessionFor(admin);

  const closed = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticket._id}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "CLOSED" });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.data.ticket.status, "CLOSED");
});

test("a ticket whose compensation is still mid-flight cannot be closed", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const ticket = await SupportTicket.create({
    user: customer._id,
    order: order._id,
    category: "RETURN_REQUEST",
    subject: "Đang trả hàng",
    description: "Đang chờ khách gửi hàng về",
    resolution: {
      type: "RETURN_REFUND",
      status: "RETURNING",
      items: [],
      createdBy: admin._id,
    },
  });
  const adminSession = await sessionFor(admin);

  const closed = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticket._id}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "CLOSED" });
  assert.equal(closed.status, 409);
  assert.equal(closed.body.code, "RESOLUTION_NOT_COMPLETED");
});

// ── #2 queue ordering by real urgency ──────────────────────────────────────

test("the admin queue orders by real workflow urgency, not enum spelling", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const make = (status, priority, subject) =>
    SupportTicket.create({
      user: customer._id,
      order: order._id,
      category: "OTHER",
      subject,
      description: "d",
      status,
      priority,
    });

  await make("CLOSED", "LOW", "closed-low");
  await make("OPEN", "NORMAL", "open-normal");
  await make("OPEN", "URGENT", "open-urgent");
  await make("OPEN", "HIGH", "open-high");
  await make("RESOLVED", "URGENT", "resolved-urgent");

  const adminSession = await sessionFor(admin);
  const listed = await adminSession.agent.get("/api/admin/support-tickets");
  assert.equal(listed.status, 200);
  const subjects = listed.body.data.tickets.map((ticket) => ticket.subject);

  assert.deepEqual(subjects, [
    "open-urgent",
    "open-high",
    "open-normal",
    "resolved-urgent",
    "closed-low",
  ]);
});

test("status and priority ranks stay in sync when a resolution moves the ticket", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await SupportTicket.create({
    user: customer._id,
    order: order._id,
    category: "OTHER",
    subject: "s",
    description: "d",
  });

  const guidance = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "GUIDANCE", note: "Hướng dẫn khách hàng" });
  assert.equal(guidance.status, 200, JSON.stringify(guidance.body));

  // The resolution service writes status via findOneAndUpdate, which skips
  // document middleware; the query hook must still refresh the rank.
  const stored = await SupportTicket.findById(ticket._id).lean();
  assert.equal(stored.status, "RESOLVED");
  assert.equal(stored.statusRank, SupportTicket.STATUS_RANK.RESOLVED);
});

test("legacy tickets without ranks are backfilled so they sort correctly", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const base = {
    user: customer._id,
    order: order._id,
    category: "OTHER",
    description: "d",
    responseDueAt: new Date(),
    resolutionDueAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ticketCode: "TK-LEGACY-0001",
  };
  // Insert straight through the driver so the rank fields are absent, exactly
  // as they are for tickets created before this migration existed.
  await SupportTicket.collection.insertMany([
    { ...base, ticketCode: "TK-LEGACY-0001", subject: "legacy-urgent", status: "OPEN", priority: "URGENT" },
    { ...base, ticketCode: "TK-LEGACY-0002", subject: "legacy-closed", status: "CLOSED", priority: "LOW" },
  ]);

  const stale = await SupportTicket.findOne({ subject: "legacy-urgent" }).lean();
  assert.equal(stale.statusRank, undefined, "precondition: the rank is missing");

  const result = await SupportTicket.migrateQueueRanks();
  assert.equal(result.updated, 2);

  const adminSession = await sessionFor(admin);
  const listed = await adminSession.agent.get("/api/admin/support-tickets");
  assert.deepEqual(
    listed.body.data.tickets.map((ticket) => ticket.subject),
    ["legacy-urgent", "legacy-closed"]
  );

  // Re-running is a no-op, so it is safe on every boot.
  assert.equal((await SupportTicket.migrateQueueRanks()).updated, 0);
});

// ── #3 notifications ───────────────────────────────────────────────────────

test("a new ticket notifies admins and an agent reply notifies the customer", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);

  const created = await customerSession.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", customerSession.csrf)
    .send({ orderId: String(order._id), category: "NOT_RECEIVED", description: "Chưa nhận được hàng" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ticketId = created.body.data.ticket._id;

  const adminNotifications = await Notification.find({ role: "admin" }).lean();
  assert.equal(adminNotifications.length, 1);
  assert.match(adminNotifications[0].title, /Ticket hỗ trợ mới/);
  assert.equal(String(adminNotifications[0].metadata.ticketId), String(ticketId));

  const replied = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/messages`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ text: "Chúng tôi đang kiểm tra với đơn vị vận chuyển." });
  assert.equal(replied.status, 201, JSON.stringify(replied.body));

  const customerNotifications = await Notification.find({ user: customer._id }).lean();
  assert.equal(customerNotifications.length, 1);
  assert.match(customerNotifications[0].title, /đã phản hồi/);
});

// ── business #2 duplicate / volume guards ──────────────────────────────────

test("a second open ticket for the same order and category is refused", async () => {
  const customer = await makeUser();
  const { order } = await makeOrder(customer);
  const session = await sessionFor(customer);

  const first = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({ orderId: String(order._id), category: "NOT_RECEIVED", description: "Giao chậm" });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({ orderId: String(order._id), category: "NOT_RECEIVED", description: "Vẫn chưa thấy hàng" });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "DUPLICATE_TICKET");
  assert.ok(second.body.data.ticketId, "response points at the existing thread");

  // A different category on the same order is still allowed.
  const other = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({ orderId: String(order._id), category: "PAYMENT_ISSUE", description: "Bị trừ tiền hai lần" });
  assert.equal(other.status, 201, JSON.stringify(other.body));
});

test("open tickets per order are capped", async () => {
  const customer = await makeUser();
  const { order } = await makeOrder(customer);
  const session = await sessionFor(customer);
  const categories = ["NOT_RECEIVED", "PAYMENT_ISSUE", "OTHER", "RETURN_REQUEST"];
  const statuses = [];
  for (const category of categories) {
    const response = await session.agent
      .post("/api/support-tickets")
      .set("x-csrf-token", session.csrf)
      .send({ orderId: String(order._id), category, description: `Vấn đề ${category}` });
    statuses.push(response.status);
  }
  // The 4th distinct-category ticket trips the per-order cap of 3. The cap is
  // checked before any category-specific validation, so RETURN_REQUEST is
  // rejected for the cap rather than for its missing item selection.
  assert.deepEqual(statuses, [201, 201, 201, 409]);
});

// ── business #3 auto triage ────────────────────────────────────────────────

test("money-related categories are triaged above generic questions on arrival", async () => {
  const customer = await makeUser();
  const { order } = await makeOrder(customer);
  const session = await sessionFor(customer);

  const payment = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({ orderId: String(order._id), category: "PAYMENT_ISSUE", description: "Tôi bị trừ tiền hai lần" });
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  assert.equal(payment.body.data.ticket.priority, "HIGH");

  const other = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({ orderId: String(order._id), category: "OTHER", description: "Cho tôi hỏi thêm" });
  assert.equal(other.status, 201, JSON.stringify(other.body));
  assert.equal(other.body.data.ticket.priority, "NORMAL");
});

test("an explicit agent priority is never overwritten by category triage", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);

  const created = await customerSession.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", customerSession.csrf)
    .send({ orderId: String(order._id), category: "PAYMENT_ISSUE", description: "Sai số tiền" });
  const ticketId = created.body.data.ticket._id;

  const lowered = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ priority: "LOW" });
  assert.equal(lowered.status, 200, JSON.stringify(lowered.body));
  assert.equal(lowered.body.data.ticket.priority, "LOW");

  // A later save (an agent reply) must not restore the category default.
  await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/messages`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ text: "Đã tiếp nhận" });
  const stored = await SupportTicket.findById(ticketId).lean();
  assert.equal(stored.priority, "LOW");
});

// ── business #4 SLA pause + auto-resolve ───────────────────────────────────

test("the resolution clock pauses while a ticket waits on the customer", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await SupportTicket.create({
    user: customer._id,
    order: order._id,
    category: "OTHER",
    subject: "s",
    description: "d",
    firstRespondedAt: new Date(),
    responseDueAt: new Date(Date.now() - 1000),
    resolutionDueAt: new Date(Date.now() - 1000),
  });

  const parked = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticket._id}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "WAITING_CUSTOMER" });
  assert.equal(parked.status, 200, JSON.stringify(parked.body));
  assert.equal(parked.body.data.ticket.sla.paused, true);
  assert.equal(
    parked.body.data.ticket.sla.resolutionBreached,
    false,
    "an overdue ticket stops breaching once it is the customer's turn"
  );
  assert.ok(await SupportTicket.exists({ _id: ticket._id, waitingCustomerSince: { $ne: null } }));
});

test("waiting time is banked and credited back when the customer replies", async () => {
  const customer = await makeUser();
  const { order } = await makeOrder(customer);
  const waitedMs = 90 * 60_000;
  const ticket = await SupportTicket.create({
    user: customer._id,
    order: order._id,
    category: "OTHER",
    subject: "s",
    description: "d",
    status: "WAITING_CUSTOMER",
    firstRespondedAt: new Date(),
    waitingCustomerSince: new Date(Date.now() - waitedMs),
  });
  const session = await sessionFor(customer);

  const replied = await session.agent
    .post(`/api/support-tickets/${ticket._id}/messages`)
    .set("x-csrf-token", session.csrf)
    .send({ text: "Tôi vẫn cần hỗ trợ" });
  assert.equal(replied.status, 201, JSON.stringify(replied.body));

  const stored = await SupportTicket.findById(ticket._id).lean();
  assert.equal(stored.status, "IN_PROGRESS");
  assert.equal(stored.waitingCustomerSince, null);
  assert.ok(
    stored.waitingCustomerMs >= waitedMs - 5000,
    `expected the wait to be banked, got ${stored.waitingCustomerMs}`
  );

  const detail = await session.agent.get(`/api/support-tickets/${ticket._id}`);
  assert.equal(detail.body.data.ticket.sla.paused, false);
  assert.ok(
    new Date(detail.body.data.ticket.effectiveResolutionDueAt).getTime() >
      new Date(stored.resolutionDueAt).getTime(),
    "the banked wait extends the effective deadline"
  );
});

test("tickets abandoned in WAITING_CUSTOMER are auto-resolved by the sweep", async () => {
  const customer = await makeUser();
  const admin = await makeUser("admin");
  const { order } = await makeOrder(customer);
  const stale = await SupportTicket.create({
    user: customer._id,
    order: order._id,
    category: "OTHER",
    subject: "abandoned",
    description: "d",
    status: "WAITING_CUSTOMER",
    assignee: admin._id,
    firstRespondedAt: new Date(),
    waitingCustomerSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  });
  const fresh = await SupportTicket.create({
    user: customer._id,
    order: order._id,
    category: "PAYMENT_ISSUE",
    subject: "recent",
    description: "d",
    status: "WAITING_CUSTOMER",
    assignee: admin._id,
    waitingCustomerSince: new Date(),
  });

  const result = await autoResolveStaleTickets();
  assert.equal(result.resolved, 1);
  assert.equal((await SupportTicket.findById(stale._id).lean()).status, "RESOLVED");
  assert.equal((await SupportTicket.findById(fresh._id).lean()).status, "WAITING_CUSTOMER");

  // The customer can still reopen the auto-closed thread.
  const session = await sessionFor(customer);
  const reopened = await session.agent
    .post(`/api/support-tickets/${stale._id}/messages`)
    .set("x-csrf-token", session.csrf)
    .send({ text: "Xin lỗi tôi mới xem tin" });
  assert.equal(reopened.status, 201, JSON.stringify(reopened.body));
  assert.equal((await SupportTicket.findById(stale._id).lean()).status, "IN_PROGRESS");
});
