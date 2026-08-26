const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  buildAutoReply,
  normalizeIntentText,
} = require("../src/services/chatAutoReplyService");

test("chat auto reply normalizes Vietnamese accents", () => {
  assert.equal(
    normalizeIntentText("Đơn hàng của tôi đến đâu rồi?"),
    "don hang cua toi den dau roi"
  );
});

test("chat auto reply recognizes common support intents", () => {
  assert.equal(buildAutoReply("Làm sao theo dõi đơn hàng?").type, "faq");
  assert.match(buildAutoReply("Chính sách đổi trả thế nào?").text, /7 ngày/);
  assert.match(buildAutoReply("Shop thanh toán bằng cách nào?").text, /VNPay/);
  assert.match(buildAutoReply("Có giao hàng toàn quốc không?").text, /toàn quốc/);
});

test("chat auto reply explicitly escalates uncertain and handoff messages", () => {
  const handoff = buildAutoReply("Tôi muốn gặp nhân viên");
  assert.equal(handoff.type, "handoff");
  assert.equal(handoff.needsHuman, true);

  const fallback = buildAutoReply("Tôi cần tư vấn một trường hợp đặc biệt");
  assert.equal(fallback.type, "fallback");
  assert.equal(fallback.needsHuman, true);
  assert.match(fallback.text, /trợ lý tự động/i);
});
