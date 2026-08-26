const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SupportTicket = require("../src/models/SupportTicket");

test("support ticket generates a code and normal-priority SLA deadlines", async () => {
  const before = Date.now();
  const ticket = new SupportTicket({
    user: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(),
    // OTHER stays at the NORMAL default; the incident categories are triaged up.
    category: "OTHER",
    subject: "Câu hỏi về đơn hàng",
    description: "Tôi muốn hỏi thêm về đơn hàng của mình.",
  });

  await ticket.validate();

  assert.match(ticket.ticketCode, /^TK-[A-Z0-9]+-[A-Z0-9]{4}$/);
  assert.equal(ticket.priority, "NORMAL");
  assert.ok(ticket.responseDueAt.getTime() >= before + 4 * 60 * 60 * 1000);
  assert.ok(ticket.resolutionDueAt.getTime() >= before + 48 * 60 * 60 * 1000);
});

test("an undelivered-parcel report is triaged high and blamed on the shop", async () => {
  const ticket = new SupportTicket({
    user: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(),
    category: "NOT_RECEIVED",
    subject: "Đơn giao chậm",
    description: "Đơn hàng chưa được giao theo lịch dự kiến.",
  });

  await ticket.validate();

  assert.equal(ticket.priority, "HIGH");
  assert.equal(ticket.faultParty, "shop");
});

test("a change-of-mind return stays normal priority and is the customer's own", async () => {
  const ticket = new SupportTicket({
    user: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(),
    category: "RETURN_REQUEST",
    subject: "Muốn trả hàng",
    description: "Tôi đổi ý và muốn trả lại sách còn nguyên vẹn.",
  });

  await ticket.validate();

  assert.equal(ticket.priority, "NORMAL");
  assert.equal(ticket.faultParty, "customer");
});

test("support ticket rejects more than three evidence images", async () => {
  const ticket = new SupportTicket({
    user: new mongoose.Types.ObjectId(),
    order: new mongoose.Types.ObjectId(),
    category: "ITEM_FAULT",
    subject: "Sách bị hỏng",
    description: "Bìa sách bị rách khi nhận hàng.",
    attachments: ["https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg", "https://example.com/4.jpg"],
  });

  await assert.rejects(ticket.validate(), /tối đa 3 ảnh/);
});
