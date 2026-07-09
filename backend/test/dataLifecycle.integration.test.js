process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const config = require("../src/config");
const AnalyticsEvent = require("../src/models/AnalyticsEvent");
const AuthSession = require("../src/models/AuthSession");
const Book = require("../src/models/Book");
const Cart = require("../src/models/Cart");
const Category = require("../src/models/Category");
const Conversation = require("../src/models/Conversation");
const Message = require("../src/models/Message");
const Notification = require("../src/models/Notification");
const Post = require("../src/models/Post");
const Promotion = require("../src/models/Promotion");
const PromotionAlertDelivery = require("../src/models/PromotionAlertDelivery");
const UploadedAsset = require("../src/models/UploadedAsset");
const User = require("../src/models/User");
const Voucher = require("../src/models/Voucher");
const VoucherRedemption = require("../src/models/VoucherRedemption");
const { cleanupOneDueAsset } = require("../src/services/assetLifecycleService");
const { deleteImage } = require("../src/services/imageStorage");

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([
    User.syncIndexes(),
    Category.syncIndexes(),
    Book.syncIndexes(),
    UploadedAsset.syncIndexes(),
    PromotionAlertDelivery.syncIndexes(),
    VoucherRedemption.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
});

async function adminAgent() {
  const agent = supertest.agent(app);
  const credentials = {
    name: "Admin",
    email: "admin-lifecycle@example.com",
    password: "secure-password",
  };
  let authenticated = await agent.post("/api/auth/register").send(credentials);
  if (authenticated.status === 429) {
    await User.create({ ...credentials, role: "admin" });
    authenticated = await agent.post("/api/auth/login").send({
      email: credentials.email,
      password: credentials.password,
    });
  }
  await User.updateOne(
    { email: "admin-lifecycle@example.com" },
    { $set: { role: "admin" } }
  );
  return {
    agent,
    csrf: authenticated.body.data.csrfToken,
    admin: await User.findOne({ email: "admin-lifecycle@example.com" }),
  };
}

test("book deletion removes live references and queues owned images", async () => {
  const { agent, csrf, admin } = await adminAgent();
  await Category.create({ name: "Fiction", slug: "fiction" });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const uploaded = await agent
    .post("/api/admin/uploads/images")
    .set("x-csrf-token", csrf)
    .attach("image", png, { filename: "cover.png", contentType: "image/png" });
  assert.equal(uploaded.status, 201);
  const image = uploaded.body.data.image;

  const created = await agent
    .post("/api/books")
    .set("x-csrf-token", csrf)
    .send({
      title: "Lifecycle Book",
      author: "Author",
      price: 100000,
      // Deletion is only allowed once physical stock and its ledger history
      // are empty; this test targets reference/asset cleanup, not inventory.
      stock: 0,
      category: "fiction",
      imageUrl: image.url,
    });
  assert.equal(created.status, 201);
  const bookId = created.body.data.book._id;
  assert.equal((await UploadedAsset.findOne({ url: image.url })).status, "attached");

  await Promise.all([
    Cart.create({ user: admin._id, items: [{ book: bookId, quantity: 1 }] }),
    User.updateOne({ _id: admin._id }, { $addToSet: { wishlist: bookId } }),
    Promotion.create({
      name: "Book sale",
      type: "percent",
      value: 10,
      startDate: new Date(Date.now() - 1000),
      endDate: new Date(Date.now() + 60000),
      scope: "products",
      books: [bookId],
    }),
    AnalyticsEvent.create({
      user: admin._id,
      sessionId: "asset-test",
      type: "product_view",
      book: bookId,
    }),
  ]);

  const deleted = await agent
    .delete(`/api/books/${bookId}`)
    .set("x-csrf-token", csrf);
  assert.equal(deleted.status, 200);
  assert.equal(await Book.exists({ _id: bookId }), null);
  assert.equal((await Cart.findOne({ user: admin._id })).items.length, 0);
  assert.equal((await User.findById(admin._id)).wishlist.length, 0);
  assert.equal((await Promotion.findOne()).books.length, 0);
  assert.equal((await AnalyticsEvent.findOne()).book, null);
  assert.equal((await UploadedAsset.findOne({ url: image.url })).status, "pending_delete");

  assert.equal(await cleanupOneDueAsset(new Date(Date.now() + 1000)), true);
  assert.equal(await UploadedAsset.exists({ url: image.url }), null);
  await assert.rejects(fs.access(path.join(config.upload.localDir, image.assetId)));
});

test("book creation rejects image URLs that were not uploaded by the admin", async () => {
  const { agent, csrf } = await adminAgent();
  await Category.create({ name: "Fiction", slug: "fiction" });

  const created = await agent
    .post("/api/books")
    .set("x-csrf-token", csrf)
    .send({
      title: "Hotlinked Book",
      author: "Author",
      price: 100000,
      stock: 5,
      category: "fiction",
      imageUrl: "https://res.cloudinary.com/demo/not-uploaded.webp",
    });

  assert.equal(created.status, 400);
  assert.equal(created.body.code, "BOOK_IMAGE_NOT_MANAGED");
  assert.equal(await Book.exists({ title: "Hotlinked Book" }), null);
});

test("editing a legacy book retains its existing external cover", async () => {
  const { agent, csrf } = await adminAgent();
  await Category.create({ name: "Fiction", slug: "fiction" });
  const legacyUrl = "https://m.media-amazon.com/images/I/legacy.jpg";
  const book = await Book.create({
    title: "Legacy Book",
    author: "Author",
    price: 100000,
    stock: 5,
    category: "fiction",
    imageUrl: legacyUrl,
  });

  const updated = await agent
    .put(`/api/books/${book._id}`)
    .set("x-csrf-token", csrf)
    .send({ imageUrl: legacyUrl });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.book.imageUrl, legacyUrl);

  // Stock is owned by the inventory ledger once the book exists, so editing it
  // through the book form is refused outright.
  const withStock = await agent
    .put(`/api/books/${book._id}`)
    .set("x-csrf-token", csrf)
    .send({ imageUrl: legacyUrl, stock: 6 });

  assert.equal(withStock.status, 400);
  assert.equal(withStock.body.code, "STOCK_NOT_DIRECTLY_EDITABLE");
  assert.equal((await Book.findById(book._id)).stock, 5);
});

test("category and post images must be uploaded and follow asset lifecycle", async () => {
  const { agent, csrf } = await adminAgent();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );

  const categoryUpload = await agent
    .post("/api/admin/uploads/images?purpose=category")
    .set("x-csrf-token", csrf)
    .attach("image", png, { filename: "category.png", contentType: "image/png" });
  assert.equal(categoryUpload.status, 201);
  const categoryUrl = categoryUpload.body.data.image.url;
  const categoryResponse = await agent
    .post("/api/categories")
    .set("x-csrf-token", csrf)
    .send({ name: "Managed Category", slug: "managed-category", image: categoryUrl });
  assert.equal(categoryResponse.status, 201);
  const categoryId = categoryResponse.body.data.category._id;
  assert.equal(
    (await UploadedAsset.findOne({ url: categoryUrl })).entityType,
    "category"
  );

  const rejectedCategory = await agent
    .post("/api/categories")
    .set("x-csrf-token", csrf)
    .send({
      name: "Hotlinked Category",
      slug: "hotlinked-category",
      image: "https://res.cloudinary.com/demo/category.webp",
    });
  assert.equal(rejectedCategory.status, 400);
  assert.equal(rejectedCategory.body.code, "CATEGORY_IMAGE_NOT_MANAGED");

  const postUpload = await agent
    .post("/api/admin/uploads/images?purpose=post")
    .set("x-csrf-token", csrf)
    .attach("image", png, { filename: "post.png", contentType: "image/png" });
  assert.equal(postUpload.status, 201);
  const postUrl = postUpload.body.data.image.url;
  const postResponse = await agent
    .post("/api/posts/admin")
    .set("x-csrf-token", csrf)
    .send({ title: "Managed Post", content: "Nội dung bài viết", thumbnail: postUrl });
  assert.equal(postResponse.status, 201);
  const postId = postResponse.body.data.post._id;
  assert.equal((await UploadedAsset.findOne({ url: postUrl })).entityType, "post");

  const rejectedPost = await agent
    .post("/api/posts/admin")
    .set("x-csrf-token", csrf)
    .send({
      title: "Hotlinked Post",
      content: "Nội dung bài viết",
      thumbnail: "https://res.cloudinary.com/demo/post.webp",
    });
  assert.equal(rejectedPost.status, 400);
  assert.equal(rejectedPost.body.code, "POST_IMAGE_NOT_MANAGED");

  assert.equal(
    (await agent
      .delete(`/api/categories/${categoryId}`)
      .set("x-csrf-token", csrf)).status,
    200
  );
  assert.equal(
    (await agent
      .delete(`/api/posts/admin/${postId}`)
      .set("x-csrf-token", csrf)).status,
    200
  );
  assert.equal(await cleanupOneDueAsset(new Date(Date.now() + 1000)), true);
  assert.equal(await cleanupOneDueAsset(new Date(Date.now() + 1000)), true);
});

test("restocking a wishlisted book creates a stock notification", async () => {
  const { agent, csrf } = await adminAgent();
  await Category.create({ name: "Fiction", slug: "fiction" });
  const book = await Book.create({
    title: "Back In Stock Book",
    author: "Author",
    price: 100_000,
    stock: 0,
    category: "fiction",
  });
  const watcher = await User.create({
    name: "Watcher",
    email: "watcher@example.com",
    password: "secure-password",
    wishlist: [book._id],
  });

  // Stock now moves through the inventory ledger, so the alert is triggered by
  // an adjustment rather than by editing the book.
  const restocked = await agent
    .post("/api/admin/inventory/adjust")
    .set("x-csrf-token", csrf)
    .send({ bookId: String(book._id), quantity: 5, reason: "Nhap bo sung" });
  assert.equal(restocked.status, 200, JSON.stringify(restocked.body));
  assert.equal((await Book.findById(book._id)).stock, 5);
  const notification = await Notification.findOne({
    user: watcher._id,
    type: "stock",
  });
  assert.ok(notification);
  assert.equal(String(notification.metadata.bookId), String(book._id));
});

test("user deletion cascades disposable references but preserves historical authors", async () => {
  const { agent, csrf } = await adminAgent();
  const target = await User.create({
    name: "Target",
    email: "target-lifecycle@example.com",
    password: "secure-password",
  });
  const conversation = await Conversation.create({ user: target._id });
  const voucher = await Voucher.create({
    code: "LIFECYCLE",
    type: "fixed",
    value: 1000,
    startAt: new Date(Date.now() - 1000),
    endAt: new Date(Date.now() + 60000),
    usageLimit: 10,
  });
  await Promise.all([
    Cart.create({ user: target._id }),
    AuthSession.create({
      user: target._id,
      sid: "lifecycle-session",
      refreshTokenHash: "hash",
      expiresAt: new Date(Date.now() + 60000),
    }),
    Message.create({ conversation: conversation._id, from: "customer", text: "hello" }),
    Notification.create({ user: target._id, title: "Private" }),
    Notification.create({ role: "all", title: "Global", readBy: [target._id] }),
    AnalyticsEvent.create({ user: target._id, type: "search", sessionId: "user-test" }),
    VoucherRedemption.create({ voucher: voucher._id, user: target._id, usageCount: 1 }),
  ]);

  const deleted = await agent
    .delete(`/api/admin/users/${target._id}`)
    .set("x-csrf-token", csrf);
  assert.equal(deleted.status, 200);
  assert.equal(await User.exists({ _id: target._id }), null);
  assert.equal(await Cart.countDocuments({ user: target._id }), 0);
  assert.equal(await AuthSession.countDocuments({ user: target._id }), 0);
  assert.equal(await Conversation.countDocuments({ user: target._id }), 0);
  assert.equal(await Message.countDocuments({ conversation: conversation._id }), 0);
  assert.equal(await Notification.countDocuments({ user: target._id }), 0);
  assert.equal((await Notification.findOne({ role: "all" })).readBy.length, 0);
  assert.equal((await AnalyticsEvent.findOne({ sessionId: "user-test" })).user, null);
  assert.equal(await VoucherRedemption.countDocuments({ user: target._id }), 0);

  const author = await User.create({
    name: "Author",
    email: "author-lifecycle@example.com",
    password: "secure-password",
  });
  await Post.create({ title: "History", slug: "history", content: "content", author: author._id });
  const blocked = await agent
    .delete(`/api/admin/users/${author._id}`)
    .set("x-csrf-token", csrf);
  assert.equal(blocked.status, 400);
  assert.ok(await User.exists({ _id: author._id }));
});

test("local image deletion rejects path traversal asset ids", async () => {
  await assert.rejects(deleteImage("../secret.webp", "local"), /Invalid local asset id/);
});
