process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const NewsletterSubscription = require("../src/models/NewsletterSubscription");
const Post = require("../src/models/Post");
const Promotion = require("../src/models/Promotion");
const User = require("../src/models/User");
const Voucher = require("../src/models/Voucher");
const { buildNewsletterEmail } = require("../src/services/emailService");
const {
  createNewsletterUnsubscribeToken,
} = require("../src/services/newsletterService");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    NewsletterSubscription.syncIndexes(),
    Post.syncIndexes(),
    Promotion.syncIndexes(),
    User.syncIndexes(),
    Voucher.syncIndexes(),
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
  assert.equal(response.status, 200);
  return { agent, csrf: response.body.data.csrfToken };
}

test("newsletter requires double opt-in and confirmation tokens are one-time", async () => {
  const invalid = await supertest(app)
    .post("/api/newsletter/subscribe")
    .send({ email: "not-an-email" });
  assert.equal(invalid.status, 400);

  const subscribed = await supertest(app)
    .post("/api/newsletter/subscribe")
    .send({ email: " Reader@Example.com " });
  assert.equal(subscribed.status, 202);
  assert.match(subscribed.body.data.confirmationUrl, /newsletter\/confirm\?token=/);

  const pending = await NewsletterSubscription.findOne({
    email: "reader@example.com",
  }).select("+confirmationTokenHash +confirmationExpiresAt");
  assert.equal(pending.status, "pending");
  assert.ok(pending.confirmationTokenHash);
  assert.ok(pending.confirmationExpiresAt > new Date());

  const token = new URL(subscribed.body.data.confirmationUrl).searchParams.get("token");
  const confirmed = await supertest(app)
    .post("/api/newsletter/confirm")
    .send({ token });
  assert.equal(confirmed.status, 200);
  assert.equal((await NewsletterSubscription.findById(pending._id)).status, "active");

  const replay = await supertest(app)
    .post("/api/newsletter/confirm")
    .send({ token });
  assert.equal(replay.status, 400);

  const activeSubscribe = await supertest(app)
    .post("/api/newsletter/subscribe")
    .send({ email: "reader@example.com" });
  assert.equal(activeSubscribe.status, 202);
  assert.equal(activeSubscribe.body.data, undefined);

  const activeSubscription = await NewsletterSubscription.findById(pending._id).select(
    "+consentVersion"
  );
  const unsubscribeToken = createNewsletterUnsubscribeToken(activeSubscription);
  const unsubscribed = await supertest(app)
    .post("/api/newsletter/unsubscribe")
    .send({ token: unsubscribeToken });
  assert.equal(unsubscribed.status, 200);
  assert.equal(
    (await NewsletterSubscription.findById(pending._id)).status,
    "unsubscribed"
  );

  const repeatedUnsubscribe = await supertest(app)
    .post("/api/newsletter/unsubscribe")
    .send({ token: unsubscribeToken });
  assert.equal(repeatedUnsubscribe.status, 200);
});

test("admin sends an existing published post only to active subscribers", async () => {
  const admin = await User.create({
    name: "Newsletter Admin",
    email: "newsletter-admin@example.com",
    password: "secure-password",
    role: "admin",
  });
  const post = await Post.create({
    title: "Những cuốn sách đáng đọc tháng này",
    slug: "sach-dang-doc-thang-nay",
    shortDescription: "Danh sách tuyển chọn mới từ BookShop.",
    content: "Nội dung bài viết newsletter.",
    author: admin._id,
    status: "published",
  });
  await NewsletterSubscription.create([
    {
      email: "active-one@example.com",
      status: "active",
      confirmedAt: new Date(),
    },
    {
      email: "active-two@example.com",
      status: "active",
      confirmedAt: new Date(),
    },
    {
      email: "stopped@example.com",
      status: "unsubscribed",
      unsubscribedAt: new Date(),
    },
  ]);
  const { agent, csrf } = await sessionFor(admin);

  const overview = await agent.get("/api/admin/newsletter");
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  assert.equal(overview.body.data.activeSubscriberCount, 2);
  assert.equal(overview.body.data.posts[0].title, post.title);

  const sent = await agent
    .post("/api/admin/newsletter/send")
    .set("x-csrf-token", csrf)
    .send({ contentType: "post", contentId: post._id });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.data.recipientCount, 2);
  assert.equal(sent.body.data.previewCount, 2);
  assert.equal(sent.body.data.failedCount, 0);

  post.status = "draft";
  await post.save();
  const rejectedDraft = await agent
    .post("/api/admin/newsletter/send")
    .set("x-csrf-token", csrf)
    .send({ contentType: "post", contentId: post._id });
  assert.equal(rejectedDraft.status, 422);
});

test("newsletter only offers promotions and vouchers that are currently usable", async () => {
  const admin = await User.create({
    name: "Newsletter Offers Admin",
    email: "newsletter-offers@example.com",
    password: "secure-password",
    role: "admin",
  });
  const now = Date.now();
  const runningPromotion = await Promotion.create({
    name: "Ưu đãi đang chạy",
    type: "percent",
    value: 15,
    startDate: new Date(now - 60_000),
    endDate: new Date(now + 3_600_000),
    scope: "category",
    category: "Văn học",
  });
  await Promotion.create({
    name: "Ưu đãi sắp diễn ra",
    type: "percent",
    value: 25,
    startDate: new Date(now + 3_600_000),
    endDate: new Date(now + 7_200_000),
    scope: "category",
    category: "Văn học",
  });
  const runningVoucher = await Voucher.create({
    code: "NEWS15",
    type: "percent",
    scope: "order",
    value: 15,
    minOrder: 200_000,
    maxDiscount: 50_000,
    startAt: new Date(now - 60_000),
    endAt: new Date(now + 3_600_000),
    usageLimit: 100,
    description: "Ưu đãi dành cho độc giả newsletter.",
  });
  await Voucher.create({
    code: "SOLDOUT",
    type: "fixed",
    scope: "order",
    value: 20_000,
    startAt: new Date(now - 60_000),
    endAt: new Date(now + 3_600_000),
    usageLimit: 1,
    usedCount: 1,
  });
  await NewsletterSubscription.create({
    email: "voucher-reader@example.com",
    status: "active",
    confirmedAt: new Date(),
  });
  const { agent, csrf } = await sessionFor(admin);

  const overview = await agent.get("/api/admin/newsletter");
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  assert.deepEqual(
    overview.body.data.promotions.map((promotion) => promotion.title),
    [runningPromotion.name]
  );
  assert.deepEqual(
    overview.body.data.vouchers.map((voucher) => voucher.code),
    [runningVoucher.code]
  );

  const sent = await agent
    .post("/api/admin/newsletter/send")
    .set("x-csrf-token", csrf)
    .send({ contentType: "voucher", contentId: runningVoucher._id });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.data.content.voucherCode, runningVoucher.code);
  assert.equal(sent.body.data.previewCount, 1);
});

test("newsletter email contains content CTA and a working unsubscribe link", () => {
  const unsubscribeUrl =
    "https://bookshop.example/newsletter/unsubscribe?token=signed-token";
  const email = buildNewsletterEmail({
    content: {
      contentType: "promotion",
      title: "Ưu đãi mùa hè",
      description: "Giảm giá sách chọn lọc.",
      promotionType: "percent",
      promotionValue: 20,
      path: "/products",
    },
    unsubscribeUrl,
  });
  assert.match(email.subject, /20%/);
  assert.match(email.html, /background:#4338CA/i);
  assert.match(email.html, /Hủy đăng ký/);
  assert.match(email.text, /newsletter\/unsubscribe/);
  assert.match(email.text, /\/products/);
});

test("voucher newsletter email prominently includes its code and conditions", () => {
  const email = buildNewsletterEmail({
    content: {
      contentType: "voucher",
      title: "Voucher NEWS15",
      description: "Ưu đãi dành cho độc giả newsletter.",
      voucherCode: "NEWS15",
      voucherType: "percent",
      voucherScope: "order",
      voucherValue: 15,
      minOrder: 200_000,
      maxDiscount: 50_000,
      path: "/products",
    },
  });
  assert.match(email.subject, /15%/);
  assert.match(email.html, /Mã voucher/);
  assert.match(email.html, /NEWS15/);
  assert.match(email.text, /Đơn tối thiểu 200\.000đ/);
  assert.match(email.text, /Giảm tối đa 50\.000đ/);
});
