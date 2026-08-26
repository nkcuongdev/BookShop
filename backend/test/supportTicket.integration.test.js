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
const SupportTicketMessage = require("../src/models/SupportTicketMessage");
const User = require("../src/models/User");
const paymentGateway = require("../src/services/paymentGateway");
const shippingService = require("../src/services/shippingService");

let mongo;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Book.syncIndexes(),
    Order.syncIndexes(),
    ReturnRequest.syncIndexes(),
    SupportTicket.syncIndexes(),
    SupportTicketMessage.syncIndexes(),
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

test("customer creates a ticket and assigned admin responds within the same thread", async () => {
  const customer = await User.create({
    name: "Ticket Customer",
    email: "ticket-customer@example.com",
    password: "secure-password",
  });
  const admin = await User.create({
    name: "Support Agent",
    email: "support-agent@example.com",
    password: "secure-password",
    role: "admin",
  });
  const order = await Order.create({
    user: customer._id,
    items: [{
      book: new mongoose.Types.ObjectId(),
      title: "Clean Code",
      category: "technology",
      price: 150000,
      quantity: 1,
      subtotal: 150000,
    }],
    subtotal: 150000,
    totalAmount: 150000,
    shippingAddress: { fullName: customer.name, phone: "0900000000", address: "1 Test Street" },
  });
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);

  const created = await customerSession.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", customerSession.csrf)
    .send({
      orderId: String(order._id),
      category: "NOT_RECEIVED",
      subject: "Đơn chưa được giao",
      description: "Đơn hàng đã chờ nhiều ngày nhưng chưa có cập nhật.",
      attachments: [],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.ticket.status, "OPEN");
  assert.equal(created.body.data.ticket.order.orderCode, order.orderCode);
  const ticketId = created.body.data.ticket._id;

  const assigned = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticketId}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ assigneeId: String(admin._id), priority: "HIGH" });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  assert.equal(String(assigned.body.data.ticket.assignee._id), String(admin._id));
  assert.equal(assigned.body.data.ticket.priority, "HIGH");

  const replied = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticketId}/messages`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ text: "BookShop đang kiểm tra với đơn vị vận chuyển." });
  assert.equal(replied.status, 201, JSON.stringify(replied.body));

  const detail = await customerSession.agent.get(`/api/support-tickets/${ticketId}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.data.ticket.status, "IN_PROGRESS");
  assert.ok(detail.body.data.ticket.firstRespondedAt);
  assert.equal(detail.body.data.messages.length, 1);
  assert.equal(detail.body.data.messages[0].from, "admin");
});

test("customer cannot create a ticket for another customer's order", async () => {
  const [owner, stranger] = await User.create([
    { name: "Owner", email: "ticket-owner@example.com", password: "secure-password" },
    { name: "Stranger", email: "ticket-stranger@example.com", password: "secure-password" },
  ]);
  const order = await Order.create({
    user: owner._id,
    items: [{ book: new mongoose.Types.ObjectId(), title: "Book", category: "other", price: 10000, quantity: 1, subtotal: 10000 }],
    subtotal: 10000,
    totalAmount: 10000,
    shippingAddress: { fullName: owner.name, phone: "0900000000", address: "1 Test Street" },
  });
  const session = await sessionFor(stranger);
  const response = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send({ orderId: String(order._id), category: "OTHER", description: "Tôi cần hỗ trợ về đơn này." });
  assert.equal(response.status, 404);
  assert.equal(await SupportTicket.countDocuments(), 0);
});

test("admin resolves a pre-delivery ticket by confirming a pending COD order", async () => {
  const customer = await User.create({
    name: "Pending Customer",
    email: "pending-ticket@example.com",
    password: "secure-password",
  });
  const admin = await User.create({
    name: "Pending Admin",
    email: "pending-ticket-admin@example.com",
    password: "secure-password",
    role: "admin",
  });
  const book = await Book.create({
    title: "Pending Book",
    author: "Author",
    category: "fiction",
    price: 120000,
    stock: 5,
  });
  const order = await Order.create({
    user: customer._id,
    items: [{ book: book._id, title: book.title, category: book.category, price: 120000, quantity: 1, subtotal: 120000 }],
    subtotal: 120000,
    totalAmount: 120000,
    shippingAddress: { fullName: customer.name, phone: "0900000000", address: "1 Test Street" },
    payment: { method: Order.PAYMENT_METHOD.COD, status: Order.PAYMENT_STATUS.UNPAID },
  });
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await createTicketThroughApi(customerSession, order, "OTHER");

  const response = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "APPROVE_ORDER", note: "Đã xác minh thông tin nhận hàng." });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.ticket.status, "RESOLVED");
  assert.equal(response.body.data.ticket.resolution.status, "COMPLETED");
  assert.equal((await Order.findById(order._id)).status, Order.STATUS.PROCESSING);
});

test("admin can resolve an in-transit ticket with guidance without changing the order", async () => {
  const customer = await User.create({
    name: "Shipping Customer",
    email: "shipping-ticket@example.com",
    password: "secure-password",
  });
  const admin = await User.create({
    name: "Shipping Admin",
    email: "shipping-ticket-admin@example.com",
    password: "secure-password",
    role: "admin",
  });
  const book = await Book.create({ title: "Shipping Book", author: "Author", category: "fiction", price: 120000, stock: 5 });
  const order = await Order.create({
    user: customer._id,
    items: [{ book: book._id, title: book.title, category: book.category, price: 120000, quantity: 1, subtotal: 120000 }],
    subtotal: 120000,
    totalAmount: 120000,
    status: Order.STATUS.SHIPPED,
    shippingAddress: { fullName: customer.name, phone: "0900000000", address: "1 Test Street" },
    payment: { method: Order.PAYMENT_METHOD.COD, status: Order.PAYMENT_STATUS.PAID },
  });
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await createTicketThroughApi(customerSession, order, "NOT_RECEIVED");

  const response = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "GUIDANCE", note: "Đơn đang trên đường giao; BookShop sẽ tiếp tục theo dõi cùng đơn vị vận chuyển." });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.ticket.resolution.status, "COMPLETED");
  assert.equal((await Order.findById(order._id)).status, Order.STATUS.SHIPPED);
});

test("admin can request cancellation for a paid order from its support ticket", async () => {
  const customer = await User.create({ name: "Paid Customer", email: "paid-ticket@example.com", password: "secure-password" });
  const admin = await User.create({ name: "Paid Admin", email: "paid-ticket-admin@example.com", password: "secure-password", role: "admin" });
  const book = await Book.create({ title: "Paid Book", author: "Author", category: "fiction", price: 120000, stock: 5 });
  const order = await Order.create({
    user: customer._id,
    items: [{ book: book._id, title: book.title, category: book.category, price: 120000, quantity: 1, subtotal: 120000 }],
    subtotal: 120000,
    totalAmount: 120000,
    status: Order.STATUS.PAID,
    shippingAddress: { fullName: customer.name, phone: "0900000000", address: "1 Test Street" },
    payment: { method: Order.PAYMENT_METHOD.VNPAY, status: Order.PAYMENT_STATUS.PAID, transactionId: "PAID-TICKET-001" },
  });
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await createTicketThroughApi(customerSession, order, "OTHER");

  const response = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "CANCEL_ORDER", note: "Khách xác nhận không còn nhu cầu nhận hàng." });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.ticket.resolution.status, "COMPLETED");
  assert.equal((await Order.findById(order._id)).status, Order.STATUS.CANCELLING);
});

async function createDeliveredOrder(user, book, overrides = {}) {
  return Order.create({
    user: user._id,
    items: [{ book: book._id, title: book.title, author: book.author, category: book.category, price: 120000, quantity: 2, subtotal: 240000 }],
    subtotal: 240000,
    totalAmount: 240000,
    status: Order.STATUS.DELIVERED,
    deliveredAt: new Date(),
    shippingAddress: { fullName: user.name, phone: "0900000000", address: "1 Test Street" },
    payment: { method: Order.PAYMENT_METHOD.COD, status: Order.PAYMENT_STATUS.PAID },
    ...overrides,
  });
}

/**
 * ITEM_FAULT and RETURN_REQUEST identify the affected goods, so those two
 * categories also need an itemIssue and the selected items.
 */
async function createTicketThroughApi(
  session,
  order,
  category = "ITEM_FAULT",
  { itemIssue = "MISSING_ITEM" } = {}
) {
  const needsItems = ["ITEM_FAULT", "RETURN_REQUEST"].includes(category);
  const body = {
    orderId: String(order._id),
    category,
    description: "Đơn hàng cần được xử lý nghiệp vụ hỗ trợ.",
  };
  if (needsItems) {
    body.requestedItems = order.items.map((item) => ({
      bookId: String(item.book?._id || item.book),
      quantity: item.quantity,
    }));
    if (category === "ITEM_FAULT") body.itemIssue = itemIssue;
  }
  const response = await session.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", session.csrf)
    .send(body);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.ticket;
}

test("admin creates a reship, reserves stock and completes the replacement delivery", async () => {
  const customer = await User.create({ name: "Reship Customer", email: "reship@example.com", password: "secure-password" });
  const admin = await User.create({ name: "Reship Admin", email: "reship-admin@example.com", password: "secure-password", role: "admin" });
  const book = await Book.create({ title: "Replacement Book", author: "Author", category: "fiction", price: 120000, stock: 5 });
  const order = await createDeliveredOrder(customer, book);
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await createTicketThroughApi(customerSession, order);

  const created = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "RESHIP", items: [{ bookId: String(book._id), quantity: 2 }], note: "Gửi bù hai quyển bị thiếu." });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.data.ticket.resolution.status, "PREPARING");
  assert.equal((await Book.findById(book._id)).stock, 3);

  const duplicateTicket = await createTicketThroughApi(customerSession, order, "OTHER");
  const duplicateResolution = await adminSession.agent
    .post(`/api/admin/support-tickets/${duplicateTicket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "RESHIP", items: [{ bookId: String(book._id), quantity: 1 }] });
  assert.equal(duplicateResolution.status, 409);
  assert.equal((await Book.findById(book._id)).stock, 3);

  const prematureClose = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticket._id}`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "RESOLVED" });
  assert.equal(prematureClose.status, 409);

  const originalCreateSupportShipment = shippingService.createSupportShipment;
  const estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  shippingService.createSupportShipment = async () => ({
    provider: "ghn",
    environment: "sandbox",
    carrier: "GHN Sandbox",
    clientOrderCode: `${order.orderCode}-SP-TEST`,
    trackingNumber: "GHN-REPLACE-001",
    providerStatus: "ready_to_pick",
    estimatedDelivery,
  });

  let shipped;
  try {
    shipped = await adminSession.agent
      .patch(`/api/admin/support-tickets/${ticket._id}/resolution/reship`)
      .set("x-csrf-token", adminSession.csrf)
      .send({ status: "SHIPPED", provider: "ghn" });
  } finally {
    shippingService.createSupportShipment = originalCreateSupportShipment;
  }
  assert.equal(shipped.status, 200, JSON.stringify(shipped.body));
  assert.equal(shipped.body.data.ticket.resolution.status, "SHIPPED");
  assert.equal(shipped.body.data.ticket.resolution.shipment.trackingNumber, "GHN-REPLACE-001");
  assert.equal(shipped.body.data.ticket.resolution.shipment.carrier, "GHN Sandbox");
  assert.equal(
    new Date(shipped.body.data.ticket.resolution.shipment.estimatedDelivery).getTime(),
    estimatedDelivery.getTime()
  );

  const delivered = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticket._id}/resolution/reship`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ status: "DELIVERED" });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  assert.equal(delivered.body.data.ticket.status, "RESOLVED");
  assert.equal(delivered.body.data.ticket.resolution.status, "DELIVERED");
});

test("COD item refund reserves the order amount until admin records the transfer", async () => {
  const customer = await User.create({ name: "Refund Customer", email: "ticket-refund@example.com", password: "secure-password" });
  const admin = await User.create({ name: "Refund Admin", email: "ticket-refund-admin@example.com", password: "secure-password", role: "admin" });
  const book = await Book.create({ title: "Refund Book", author: "Author", category: "fiction", price: 120000, stock: 5 });
  const order = await createDeliveredOrder(customer, book);
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await createTicketThroughApi(customerSession, order, "ITEM_FAULT", { itemIssue: "DAMAGED" });

  const created = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "PARTIAL_REFUND", items: [{ bookId: String(book._id), quantity: 1 }] });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.data.ticket.resolution.status, "REFUND_MANUAL_REQUIRED");
  assert.equal(created.body.data.ticket.resolution.amount, 120000);
  let updatedOrder = await Order.findById(order._id).select("+supportCompensation.reservedRefundAmount");
  assert.equal(updatedOrder.supportCompensation.reservedRefundAmount, 120000);

  const completed = await adminSession.agent
    .patch(`/api/admin/support-tickets/${ticket._id}/resolution/refund`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ transactionId: "BANK-REFUND-001" });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.data.ticket.resolution.status, "REFUND_COMPLETED");
  updatedOrder = await Order.findById(order._id).select("+supportCompensation.reservedRefundAmount");
  assert.equal(updatedOrder.supportCompensation.reservedRefundAmount, 0);
  assert.equal(updatedOrder.supportCompensation.refundedAmount, 120000);
});

test("admin-created return resolution uses the existing return workflow", async () => {
  const customer = await User.create({ name: "Return Ticket Customer", email: "ticket-return@example.com", password: "secure-password" });
  const admin = await User.create({ name: "Return Ticket Admin", email: "ticket-return-admin@example.com", password: "secure-password", role: "admin" });
  const book = await Book.create({ title: "Return Book", author: "Author", category: "fiction", price: 120000, stock: 5 });
  const order = await createDeliveredOrder(customer, book);
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);
  const createdTicket = await customerSession.agent
    .post("/api/support-tickets")
    .set("x-csrf-token", customerSession.csrf)
    .send({
      orderId: String(order._id),
      // A printing defect is the shop's mistake, so it belongs under ITEM_FAULT
      // with the defect stated explicitly rather than under a change of mind.
      category: "ITEM_FAULT",
      itemIssue: "QUALITY_ISSUE",
      description: "Sách bị lỗi in, tôi muốn gửi trả sản phẩm này.",
      requestedItems: [{ bookId: String(book._id), quantity: 1 }],
    });
  assert.equal(createdTicket.status, 201, JSON.stringify(createdTicket.body));
  const ticket = createdTicket.body.data.ticket;
  assert.equal(ticket.requestDetails.returnReason, "QUALITY_ISSUE");
  assert.equal(ticket.requestDetails.itemIssue, "QUALITY_ISSUE");
  assert.equal(ticket.returnShippingPaidBy, "shop", "a shop fault means the shop pays return shipping");
  assert.equal(ticket.requestDetails.items[0].quantity, 1);
  assert.equal(await ReturnRequest.countDocuments({ order: order._id }), 0);

  const response = await adminSession.agent
    .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
    .set("x-csrf-token", adminSession.csrf)
    .send({ type: "RETURN_REFUND", items: [{ bookId: String(book._id), quantity: 1 }], note: "Vui lòng đóng gói sách giao sai." });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.ticket.resolution.status, "RETURNING");
  const returnRequest = await ReturnRequest.findOne({ order: order._id });
  assert.equal(returnRequest.status, ReturnRequest.STATUS.RETURNING);
  assert.equal(returnRequest.reason, ReturnRequest.REASON.QUALITY_ISSUE);
  assert.equal(returnRequest.returnShippingPaidBy, "shop");
});

test("online item refund completes through the idempotent payment gateway", async () => {
  const customer = await User.create({ name: "Online Refund Customer", email: "online-refund@example.com", password: "secure-password" });
  const admin = await User.create({ name: "Online Refund Admin", email: "online-refund-admin@example.com", password: "secure-password", role: "admin" });
  const book = await Book.create({ title: "Online Refund Book", author: "Author", category: "fiction", price: 120000, stock: 5 });
  const order = await createDeliveredOrder(customer, book, {
    payment: {
      method: Order.PAYMENT_METHOD.VNPAY,
      status: Order.PAYMENT_STATUS.PAID,
      transactionId: "VNPAY-ORIGINAL-001",
      providerOrderId: "VNPAY-ORDER-001",
      providerCreatedAt: new Date(),
    },
  });
  const customerSession = await sessionFor(customer);
  const adminSession = await sessionFor(admin);
  const ticket = await createTicketThroughApi(customerSession, order, "ITEM_FAULT", { itemIssue: "DAMAGED" });

  const originalRequestRefund = paymentGateway.requestRefund;
  paymentGateway.requestRefund = async ({ idempotencyKey, amount }) => ({
    ok: true,
    refundTransactionId: `MOCK-${idempotencyKey}`,
    amount,
    completed: true,
  });
  try {
    const response = await adminSession.agent
      .post(`/api/admin/support-tickets/${ticket._id}/resolution`)
      .set("x-csrf-token", adminSession.csrf)
      .send({ type: "PARTIAL_REFUND", items: [{ bookId: String(book._id), quantity: 1 }] });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.ticket.resolution.status, "REFUND_COMPLETED");
    assert.ok(response.body.data.ticket.resolution.refund.transactionId);
    const updatedOrder = await Order.findById(order._id).select("+supportCompensation.reservedRefundAmount");
    assert.equal(updatedOrder.supportCompensation.reservedRefundAmount, 0);
    assert.equal(updatedOrder.supportCompensation.refundedAmount, 120000);
  } finally {
    paymentGateway.requestRefund = originalRequestRefund;
  }
});
