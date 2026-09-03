const assert = require("node:assert/strict");
const test = require("node:test");
const config = require("../src/config");
const { buildOrderLifecycleEmail } = require("../src/services/emailService");

test("buildOrderLifecycleEmail renders an order snapshot and tracking details", () => {
  const email = buildOrderLifecycleEmail(
    {
      title: "Đơn hàng đang giao",
      message: "Đơn hàng OD-2026 đang trên đường giao đến bạn.",
      link: "/profile/orders/order-id",
      metadata: { orderId: "order-id", orderCode: "OD-2026" },
    },
    {
      orderCode: "OD-2026",
      totalAmount: 1_250_000,
      payment: { method: "COD" },
      carrier: "Giao Hàng Nhanh",
      trackingNumber: "GHN-123",
      items: [
        {
          title: "Clean Code",
          quantity: 2,
          price: 300_000,
          subtotal: 600_000,
        },
      ],
    },
    "Nguyễn An"
  );

  assert.match(email.subject, /Đơn hàng đang giao/);
  assert.match(email.subject, /OD-2026/);
  assert.match(email.text, /Nguyễn An/);
  assert.match(email.text, /1\.250\.000đ/);
  assert.match(email.text, /Thanh toán khi nhận hàng/);
  assert.match(email.text, /Clean Code × 2: 600\.000đ/);
  assert.match(email.text, /Giao Hàng Nhanh/);
  assert.match(email.text, /GHN-123/);
  assert.equal(email.url, `${config.frontendUrl}/profile/orders/order-id`);
  assert.match(email.html, /Xem chi tiết đơn hàng/);
});

test("buildOrderLifecycleEmail escapes user-controlled content and rejects external links", () => {
  const email = buildOrderLifecycleEmail(
    {
      title: "Đã giao <script>alert(1)</script>",
      message: '<img src=x onerror="alert(1)">',
      link: "//attacker.example/steal",
      metadata: { orderCode: "OD-XSS" },
    },
    {
      items: [
        {
          title: '<svg onload="alert(1)">',
          quantity: 1,
          subtotal: 100_000,
        },
      ],
    },
    '<b onclick="alert(1)">Khách</b>'
  );

  assert.equal(email.url, config.frontendUrl);
  assert.doesNotMatch(email.html, /<script>|<img src=x|<svg onload|<b onclick/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.ok(email.html.includes(`href="${config.frontendUrl}"`));
});
