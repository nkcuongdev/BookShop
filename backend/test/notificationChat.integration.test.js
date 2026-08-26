process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Conversation = require("../src/models/Conversation");
const Message = require("../src/models/Message");
const Notification = require("../src/models/Notification");
const User = require("../src/models/User");
const notificationService = require("../src/services/notificationService");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Conversation.syncIndexes(),
    Message.syncIndexes(),
    Notification.syncIndexes(),
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

async function registeredAgent(email, role = "user") {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/register").send({
    name: email.split("@")[0],
    email,
    password: "secure-password",
  });
  assert.equal(response.status, 201);
  if (role === "admin") {
    await User.updateOne({ email }, { $set: { role: "admin" } });
  }
  return { agent, csrf: response.body.data.csrfToken };
}

async function sessionFor(user) {
  const agent = supertest.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(response.status, 200);
  return { agent, csrf: response.body.data.csrfToken };
}

test("role notifications are read independently by each admin", async () => {
  const first = await registeredAgent("admin-one@example.com", "admin");
  const second = await registeredAgent("admin-two@example.com", "admin");
  const notification = await Notification.create({
    role: "admin",
    type: "system",
    title: "Admin notice",
  });

  const [firstBefore, secondBefore] = await Promise.all([
    first.agent.get("/api/notifications"),
    second.agent.get("/api/notifications"),
  ]);
  assert.equal(firstBefore.body.data.unreadCount, 1);
  assert.equal(secondBefore.body.data.unreadCount, 1);

  const marked = await first.agent
    .patch(`/api/notifications/${notification._id}/read`)
    .set("x-csrf-token", first.csrf);
  assert.equal(marked.status, 200);

  const [firstAfter, secondAfter] = await Promise.all([
    first.agent.get("/api/notifications"),
    second.agent.get("/api/notifications"),
  ]);
  assert.equal(firstAfter.body.data.unreadCount, 0);
  assert.equal(secondAfter.body.data.unreadCount, 1);
});

test("notification center paginates, filters and enforces channel preferences", async () => {
  const user = await User.create({
    name: "Notification Customer",
    email: "notification-customer@example.com",
    password: "secure-password",
    emailVerifiedAt: new Date(),
  });
  const { agent, csrf } = await sessionFor(user);
  await Notification.insertMany([
    ...Array.from({ length: 12 }, (_, index) => ({
      user: user._id,
      type: "order",
      title: `Order notice ${index}`,
      readAt: index % 2 ? new Date() : null,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      user: user._id,
      type: "payment",
      title: `Payment notice ${index}`,
    })),
  ]);

  const secondPage = await agent.get(
    "/api/notifications?type=order&page=2&limit=5"
  );
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.data.notifications.length, 5);
  assert.equal(secondPage.body.data.pagination.total, 12);
  assert.equal(secondPage.body.data.pagination.totalPages, 3);

  const unreadOrders = await agent.get(
    "/api/notifications?type=order&read=unread&limit=20"
  );
  assert.equal(unreadOrders.status, 200);
  assert.equal(unreadOrders.body.data.pagination.total, 6);
  assert.ok(unreadOrders.body.data.notifications.every((item) => !item.readAt));

  const defaults = await agent.get("/api/notifications/preferences");
  assert.equal(defaults.status, 200);
  assert.equal(defaults.body.data.preferences.inApp.shipping, true);
  assert.equal(defaults.body.data.preferences.inApp.promotion, true);
  assert.equal(defaults.body.data.preferences.email.order, true);
  assert.equal(defaults.body.data.preferences.email.payment, true);
  assert.equal(defaults.body.data.preferences.email.shipping, true);
  assert.equal(defaults.body.data.preferences.email.refund, true);
  assert.equal(defaults.body.data.preferences.email.chat, false);
  assert.equal(defaults.body.data.preferences.email.promotion, false);

  const saved = await agent
    .patch("/api/notifications/preferences")
    .set("x-csrf-token", csrf)
    .send({ inApp: { shipping: false }, email: { payment: true } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.preferences.inApp.shipping, false);
  assert.equal(saved.body.data.preferences.email.payment, true);

  const suppressed = await notificationService.notifyUser(user._id, {
    type: "shipping",
    title: "Suppressed shipping notice",
  });
  assert.equal(suppressed, null);
  assert.equal(
    await Notification.countDocuments({ title: "Suppressed shipping notice" }),
    0
  );

  const paymentNotice = await notificationService.notifyUser(user._id, {
    type: "payment",
    title: "Allowed payment notice",
  });
  assert.ok(paymentNotice);

  await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: null } });
  const unverifiedEmail = await agent
    .patch("/api/notifications/preferences")
    .set("x-csrf-token", csrf)
    .send({ email: { order: true } });
  assert.equal(unverifiedEmail.status, 400);

  const invalidType = await agent.get("/api/notifications?type=unknown");
  assert.equal(invalidType.status, 400);
});

test("chat upsert is unique and message history uses a bounded cursor", async () => {
  const { agent, csrf } = await registeredAgent("chat-user@example.com");
  const responses = await Promise.all([
    agent.get("/api/chat/me"),
    agent.get("/api/chat/me"),
  ]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(await Conversation.countDocuments(), 1);

  const conversation = await Conversation.findOne();
  await Message.insertMany(
    Array.from({ length: 75 }, (_, index) => ({
      conversation: conversation._id,
      from: index % 2 ? "admin" : "customer",
      text: `message-${index}`,
      at: new Date(Date.now() + index),
    }))
  );

  const firstPage = await agent.get("/api/chat/me?limit=50");
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.data.messages.length, 50);
  assert.equal(firstPage.body.data.pageInfo.hasMore, true);
  assert.ok(firstPage.body.data.pageInfo.nextCursor);

  const olderPage = await agent.get(
    `/api/chat/me?limit=50&before=${firstPage.body.data.pageInfo.nextCursor}`
  );
  assert.equal(olderPage.status, 200);
  assert.equal(olderPage.body.data.messages.length, 25);
  assert.equal(olderPage.body.data.pageInfo.hasMore, false);

  const oversized = await agent
    .post("/api/chat/me/messages")
    .set("x-csrf-token", csrf)
    .send({ text: "x".repeat(2001) });
  assert.equal(oversized.status, 400);
});

test("chat sends labeled FAQ replies and pauses automation after human handoff", async () => {
  const { agent, csrf } = await registeredAgent("auto-chat-user@example.com");

  const faqResponse = await agent
    .post("/api/chat/me/messages")
    .set("x-csrf-token", csrf)
    .send({ text: "Làm sao để theo dõi đơn hàng?" });

  assert.equal(faqResponse.status, 201);
  assert.equal(faqResponse.body.data.autoReply.automated, true);
  assert.equal(faqResponse.body.data.autoReply.automationType, "faq");
  assert.match(faqResponse.body.data.autoReply.text, /Đơn hàng của tôi/);

  const handoffResponse = await agent
    .post("/api/chat/me/messages")
    .set("x-csrf-token", csrf)
    .send({ text: "Tôi muốn gặp nhân viên hỗ trợ" });

  assert.equal(handoffResponse.status, 201);
  assert.equal(handoffResponse.body.data.autoReply.automationType, "handoff");
  assert.equal((await Conversation.findOne()).needsHuman, true);

  const messagesBefore = await Message.countDocuments();
  const pausedResponse = await agent
    .post("/api/chat/me/messages")
    .set("x-csrf-token", csrf)
    .send({ text: "Mã đơn của tôi là BS-123" });

  assert.equal(pausedResponse.status, 201);
  assert.equal(pausedResponse.body.data.autoReply, null);
  assert.equal(await Message.countDocuments(), messagesBefore + 1);
});
