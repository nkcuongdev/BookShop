process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const promotionAlerts = require("../src/jobs/promotionAlerts");
const Book = require("../src/models/Book");
const Category = require("../src/models/Category");
const Notification = require("../src/models/Notification");
const Promotion = require("../src/models/Promotion");
const PromotionAlertDelivery = require("../src/models/PromotionAlertDelivery");
const User = require("../src/models/User");
const {
  processPromotionWishlistAlerts,
} = require("../src/services/promotionAlertService");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Category.syncIndexes(),
    Book.syncIndexes(),
    Promotion.syncIndexes(),
    PromotionAlertDelivery.syncIndexes(),
    Notification.syncIndexes(),
  ]);
});

after(async () => {
  promotionAlerts.stop();
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
    name: "Promotion Admin",
    email: "promotion-alert-admin@example.com",
    password: "secure-password",
    role: "admin",
  });
  const agent = supertest.agent(app);
  const login = await agent.post("/api/auth/login").send({
    email: admin.email,
    password: "secure-password",
  });
  assert.equal(login.status, 200);
  return { agent, csrf: login.body.data.csrfToken };
}

test("a running promotion alerts wishlisted-book owners exactly once", async () => {
  const { agent, csrf } = await adminSession();
  await Category.create({ name: "Fiction", slug: "fiction" });
  const book = await Book.create({
    title: "Wishlist Sale Book",
    author: "Author",
    price: 200_000,
    stock: 5,
    category: "fiction",
  });
  const [watcher, ignored] = await User.create([
    {
      name: "Watcher",
      email: "promotion-watcher@example.com",
      password: "secure-password",
      wishlist: [book._id],
    },
    {
      name: "Not Watching",
      email: "not-watching@example.com",
      password: "secure-password",
    },
  ]);

  const created = await agent
    .post("/api/admin/promotions")
    .set("x-csrf-token", csrf)
    .send({
      name: "Wishlist sale",
      description: "Targeted discount",
      type: "percent",
      value: 25,
      startDate: new Date(Date.now() - 60_000).toISOString(),
      endDate: new Date(Date.now() + 60 * 60_000).toISOString(),
      scope: "products",
      books: [book._id],
      active: true,
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const promotionId = created.body.data.promotion._id;

  const notification = await Notification.findOne({
    user: watcher._id,
    type: "promotion",
  });
  assert.ok(notification);
  assert.match(notification.message, /25%/);
  assert.equal(notification.metadata.originalPrice, 200_000);
  assert.equal(notification.metadata.salePrice, 150_000);
  assert.equal(String(notification.metadata.bookId), String(book._id));
  assert.equal(
    await Notification.countDocuments({ user: ignored._id, type: "promotion" }),
    0
  );

  await processPromotionWishlistAlerts(promotionId, app);
  assert.equal(
    await Notification.countDocuments({ user: watcher._id, type: "promotion" }),
    1
  );
  const delivery = await PromotionAlertDelivery.findOne({
    user: watcher._id,
    promotion: promotionId,
    book: book._id,
  });
  assert.equal(delivery.status, "completed");

  const weakerPromotion = await Promotion.create({
    name: "Weaker overlapping sale",
    type: "percent",
    value: 10,
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 60 * 60_000),
    scope: "products",
    books: [book._id],
    active: true,
  });
  await processPromotionWishlistAlerts(weakerPromotion, app);
  assert.equal(
    await Notification.countDocuments({ user: watcher._id, type: "promotion" }),
    1
  );
});

test("promotion preference suppresses the notification but records processing", async () => {
  await Category.create({ name: "Business", slug: "business" });
  const book = await Book.create({
    title: "Quiet Sale Book",
    author: "Author",
    price: 100_000,
    stock: 2,
    category: "business",
  });
  const watcher = await User.create({
    name: "Quiet Watcher",
    email: "quiet-watcher@example.com",
    password: "secure-password",
    wishlist: [book._id],
    notificationPreferences: {
      inApp: { promotion: false },
      email: { promotion: false },
    },
  });
  const promotion = await Promotion.create({
    name: "Quiet promotion",
    type: "fixed",
    value: 10_000,
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 60 * 60_000),
    scope: "products",
    books: [book._id],
    active: true,
  });

  const result = await processPromotionWishlistAlerts(promotion, app);
  assert.equal(result.processed, true);
  assert.equal(
    await Notification.countDocuments({ user: watcher._id, type: "promotion" }),
    0
  );
  assert.equal(
    await PromotionAlertDelivery.countDocuments({
      user: watcher._id,
      promotion: promotion._id,
      status: "completed",
    }),
    1
  );
});

test("scheduled promotions alert wishlist owners when their start time arrives", async () => {
  await Category.create({ name: "History", slug: "history" });
  const book = await Book.create({
    title: "Future Sale Book",
    author: "Author",
    price: 150_000,
    stock: 3,
    category: "history",
  });
  const watcher = await User.create({
    name: "Future Watcher",
    email: "future-watcher@example.com",
    password: "secure-password",
    wishlist: [book._id],
  });
  const startDate = new Date(Date.now() + 5 * 60_000);
  const promotion = await Promotion.create({
    name: "Future promotion",
    type: "percent",
    value: 10,
    startDate,
    endDate: new Date(startDate.getTime() + 60 * 60_000),
    scope: "category",
    category: "history",
    active: true,
  });

  await promotionAlerts.tick(new Date());
  assert.equal(await Notification.countDocuments({ user: watcher._id }), 0);

  await promotionAlerts.tick(new Date(startDate.getTime() + 1_000));
  assert.equal(
    await Notification.countDocuments({ user: watcher._id, type: "promotion" }),
    1
  );
  assert.ok((await Promotion.findById(promotion._id)).wishlistAlertProcessedAt);

  await promotionAlerts.tick(new Date(startDate.getTime() + 2_000));
  assert.equal(
    await Notification.countDocuments({ user: watcher._id, type: "promotion" }),
    1
  );
});
