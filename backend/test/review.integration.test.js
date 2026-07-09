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
const Review = require("../src/models/Review");
const ReviewReport = require("../src/models/ReviewReport");
const Order = require("../src/models/Order");
const UploadedAsset = require("../src/models/UploadedAsset");
const User = require("../src/models/User");

let mongo;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Book.syncIndexes(),
    Review.syncIndexes(),
    ReviewReport.syncIndexes(),
    Order.syncIndexes(),
    UploadedAsset.syncIndexes(),
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

test("public review responses are paginated and never expose email", async () => {
  const book = await Book.create({
    title: "Reviewed Book",
    author: "Author",
    price: 100_000,
    stock: 10,
    category: "fiction",
  });
  const users = await User.create(
    Array.from({ length: 12 }, (_, index) => ({
      name: `Reviewer ${index}`,
      email: `private-${index}@example.com`,
      password: "secure-password",
    }))
  );
  await Review.create(
    users.map((user, index) => ({
      book: book._id,
      user: user._id,
      userName: user.name,
      rating: (index % 5) + 1,
      comment: `A sufficiently long review number ${index}`,
    }))
  );
  await Book.updateRating(book._id);

  const firstPage = await supertest(app).get(
    `/api/books/${book._id}/reviews?page=1&limit=5`
  );
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.data.reviews.length, 5);
  assert.equal(firstPage.body.data.pagination.total, 12);
  assert.equal(firstPage.body.data.pagination.totalPages, 3);
  assert.doesNotMatch(JSON.stringify(firstPage.body), /private-\d+@example\.com/);
  assert.equal(
    Object.hasOwn(firstPage.body.data.reviews[0], "user"),
    false
  );

  const bookDetail = await supertest(app).get(`/api/books/${book._id}`);
  assert.equal(bookDetail.status, 200);
  assert.equal(bookDetail.body.data.reviews.length, 10);
  assert.equal(bookDetail.body.data.reviewPagination.total, 12);
  assert.doesNotMatch(JSON.stringify(bookDetail.body), /private-\d+@example\.com/);
});

test("review writes reject fractional ratings and invalid comment lengths", async () => {
  const agent = supertest.agent(app);
  const registered = await agent.post("/api/auth/register").send({
    name: "Reviewer",
    email: "reviewer@example.com",
    password: "secure-password",
  });
  const csrf = registered.body.data.csrfToken;
  const book = await Book.create({
    title: "Validation Book",
    author: "Author",
    price: 100_000,
    stock: 10,
    category: "fiction",
  });

  const fractional = await agent
    .post(`/api/books/${book._id}/reviews`)
    .set("x-csrf-token", csrf)
    .send({ rating: 4.5, comment: "This comment is long enough" });
  assert.equal(fractional.status, 400);

  const tooShort = await agent
    .post(`/api/books/${book._id}/reviews`)
    .set("x-csrf-token", csrf)
    .send({ rating: 5, comment: "short" });
  assert.equal(tooShort.status, 400);
});

test("review images enforce upload ownership, limit, edit cleanup and delete cleanup", async () => {
  async function login(agent, user) {
    const response = await agent.post("/api/auth/login").send({
      email: user.email,
      password: "secure-password",
    });
    return { user: response.body.data.user, csrf: response.body.data.csrfToken };
  }

  const ownerAgent = supertest.agent(app);
  const strangerAgent = supertest.agent(app);
  const [ownerUser, strangerUser] = await User.create([
    {
      name: "Photo Owner",
      email: "photo-owner@example.com",
      password: "secure-password",
    },
    {
      name: "Photo Stranger",
      email: "photo-stranger@example.com",
      password: "secure-password",
    },
  ]);
  const owner = await login(ownerAgent, ownerUser);
  const stranger = await login(strangerAgent, strangerUser);
  const book = await Book.create({
    title: "Photo Review Book",
    author: "Author",
    price: 100_000,
    stock: 10,
    category: "fiction",
  });
  await Order.create({
    user: owner.user.id,
    items: [
      {
        book: book._id,
        title: book.title,
        price: book.price,
        quantity: 1,
        subtotal: book.price,
      },
    ],
    subtotal: book.price,
    totalAmount: book.price,
    shippingAddress: {
      fullName: "Photo Owner",
      phone: "0900000000",
      address: "1 Test Street",
    },
    status: Order.STATUS.DELIVERED,
    deliveredAt: new Date(),
    payment: {
      method: Order.PAYMENT_METHOD.COD,
      status: Order.PAYMENT_STATUS.PAID,
    },
  });

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const forbiddenUpload = await strangerAgent
    .post(`/api/uploads/review-images?bookId=${book._id}`)
    .set("x-csrf-token", stranger.csrf)
    .attach("image", png, { filename: "review.png", contentType: "image/png" });
  assert.equal(forbiddenUpload.status, 403);

  const uploaded = await ownerAgent
    .post(`/api/uploads/review-images?bookId=${book._id}`)
    .set("x-csrf-token", owner.csrf)
    .attach("image", png, { filename: "review.png", contentType: "image/png" });
  assert.equal(uploaded.status, 201);
  const firstUrl = uploaded.body.data.image.url;
  const firstAsset = await UploadedAsset.findOne({ url: firstUrl });
  assert.equal(firstAsset.purpose, "review");
  assert.equal(firstAsset.status, "temporary");

  const strangerAsset = await UploadedAsset.create({
    assetId: "stranger-review.webp",
    url: "https://images.example/stranger-review.webp",
    provider: "local",
    owner: stranger.user.id,
    purpose: "review",
    status: "temporary",
    expiresAt: new Date(Date.now() + 60_000),
  });
  const stolen = await ownerAgent
    .post(`/api/books/${book._id}/reviews`)
    .set("x-csrf-token", owner.csrf)
    .send({
      rating: 5,
      comment: "This review tries to steal another user's image",
      images: [firstUrl, strangerAsset.url],
    });
  assert.equal(stolen.status, 400);
  assert.equal((await UploadedAsset.findOne({ url: firstUrl })).status, "temporary");

  const tooMany = await ownerAgent
    .post(`/api/books/${book._id}/reviews`)
    .set("x-csrf-token", owner.csrf)
    .send({
      rating: 5,
      comment: "This review contains too many arbitrary image URLs",
      images: ["a", "b", "c", "d"],
    });
  assert.equal(tooMany.status, 400);

  const created = await ownerAgent
    .post(`/api/books/${book._id}/reviews`)
    .set("x-csrf-token", owner.csrf)
    .send({
      rating: 5,
      comment: "The actual package and book arrived in great condition",
      images: [firstUrl],
    });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.data.review.images, [firstUrl]);
  const reviewId = created.body.data.review.id;
  assert.equal((await UploadedAsset.findOne({ url: firstUrl })).status, "attached");

  const secondAsset = await UploadedAsset.create({
    assetId: "second-review.webp",
    url: "https://images.example/second-review.webp",
    provider: "local",
    owner: owner.user.id,
    purpose: "review",
    status: "temporary",
    expiresAt: new Date(Date.now() + 60_000),
  });
  const edited = await ownerAgent
    .patch(`/api/books/${book._id}/reviews/${reviewId}`)
    .set("x-csrf-token", owner.csrf)
    .send({
      rating: 4,
      comment: "Updated review keeps a different photo of the delivered book",
      images: [secondAsset.url],
    });
  assert.equal(edited.status, 200);
  assert.deepEqual(edited.body.data.review.images, [secondAsset.url]);
  assert.equal((await UploadedAsset.findOne({ url: firstUrl })).status, "pending_delete");
  assert.equal((await UploadedAsset.findOne({ url: secondAsset.url })).status, "attached");

  const publicResponse = await supertest(app).get(`/api/books/${book._id}/reviews`);
  assert.deepEqual(publicResponse.body.data.reviews[0].images, [secondAsset.url]);

  const deleted = await ownerAgent
    .delete(`/api/books/${book._id}/reviews/${reviewId}`)
    .set("x-csrf-token", owner.csrf);
  assert.equal(deleted.status, 200);
  assert.equal(
    (await UploadedAsset.findOne({ url: secondAsset.url })).status,
    "pending_delete"
  );
});

test("review creation rolls back review and asset claims when aggregate persistence fails", async () => {
  const agent = supertest.agent(app);
  const user = await User.create({
    name: "Transactional Reviewer",
    email: "transactional-reviewer@example.com",
    password: "secure-password",
  });
  const login = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  const book = await Book.create({
    title: "Transactional Review Book",
    author: "Author",
    price: 100_000,
    stock: 10,
    category: "fiction",
  });
  await Order.create({
    user: user._id,
    items: [{
      book: book._id,
      title: book.title,
      price: book.price,
      quantity: 1,
      subtotal: book.price,
    }],
    subtotal: book.price,
    totalAmount: book.price,
    shippingAddress: {
      fullName: user.name,
      phone: "0900000000",
      address: "1 Transaction Street",
    },
    status: Order.STATUS.DELIVERED,
    deliveredAt: new Date(),
    payment: { method: Order.PAYMENT_METHOD.COD, status: Order.PAYMENT_STATUS.PAID },
  });
  const asset = await UploadedAsset.create({
    assetId: "transaction-review.webp",
    url: "https://images.example/transaction-review.webp",
    provider: "local",
    owner: user._id,
    purpose: "review",
    status: "temporary",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const originalAddRating = Book.addRating;
  Book.addRating = async () => {
    throw new Error("injected aggregate failure");
  };
  let response;
  try {
    response = await agent
      .post(`/api/books/${book._id}/reviews`)
      .set("x-csrf-token", login.body.data.csrfToken)
      .send({
        rating: 5,
        comment: "This review must roll back as one atomic operation",
        images: [asset.url],
      });
  } finally {
    Book.addRating = originalAddRating;
  }

  assert.equal(response.status, 500);
  assert.equal(await Review.countDocuments({ book: book._id, user: user._id }), 0);
  assert.equal((await UploadedAsset.findById(asset._id)).status, "temporary");
  const unchangedBook = await Book.findById(book._id).select("+ratingSum");
  assert.equal(unchangedBook.ratingSum, 0);
  assert.equal(unchangedBook.reviewCount, 0);
});

test("owners can edit/delete, customers report once, and admins hide/restore reviews", async () => {
  async function register(agent, name, email) {
    const response = await agent.post("/api/auth/register").send({
      name,
      email,
      password: "secure-password",
    });
    assert.equal(response.status, 201);
    return { user: response.body.data.user, csrf: response.body.data.csrfToken };
  }

  const ownerAgent = supertest.agent(app);
  const reporterAgent = supertest.agent(app);
  const adminAgent = supertest.agent(app);
  const ownerAuth = await register(ownerAgent, "Owner", "owner-review@example.com");
  const reporterAuth = await register(reporterAgent, "Reporter", "reporter-review@example.com");
  const adminAuth = await register(adminAgent, "Moderator", "moderator-review@example.com");
  await User.updateOne({ _id: adminAuth.user.id }, { role: "admin" });

  const book = await Book.create({
    title: "Review Lifecycle Book",
    author: "Author",
    price: 100_000,
    stock: 10,
    category: "fiction",
  });
  const ownerReview = await Review.create({
    book: book._id,
    user: ownerAuth.user.id,
    userName: "Owner",
    rating: 5,
    comment: "An original review with enough detail",
  });
  const legacyVisibleReview = await Review.create({
    book: book._id,
    user: reporterAuth.user.id,
    userName: "Reporter",
    rating: 4,
    comment: "A second visible review with enough detail",
  });
  await Review.collection.updateOne(
    { _id: legacyVisibleReview._id },
    { $unset: { status: "" } }
  );
  await Book.updateRating(book._id);

  const forbiddenEdit = await reporterAgent
    .patch(`/api/books/${book._id}/reviews/${ownerReview._id}`)
    .set("x-csrf-token", reporterAuth.csrf)
    .send({ rating: 1, comment: "Trying to alter another customer review" });
  assert.equal(forbiddenEdit.status, 404);

  const edited = await ownerAgent
    .patch(`/api/books/${book._id}/reviews/${ownerReview._id}`)
    .set("x-csrf-token", ownerAuth.csrf)
    .send({ rating: 3, comment: "Updated review content remains sufficiently long" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.bookRating, 3.5);
  assert.equal(edited.body.data.bookReviewCount, 2);

  const reportUrl = `/api/books/${book._id}/reviews/${ownerReview._id}/report`;
  const reported = await reporterAgent
    .post(reportUrl)
    .set("x-csrf-token", reporterAuth.csrf)
    .send({ reason: "spam", details: "Repeated promotional content" });
  assert.equal(reported.status, 201);
  const duplicateReport = await reporterAgent
    .post(reportUrl)
    .set("x-csrf-token", reporterAuth.csrf)
    .send({ reason: "spam" });
  assert.equal(duplicateReport.status, 200);
  assert.equal((await Review.findById(ownerReview._id)).reportCount, 1);

  const queue = await adminAgent
    .get("/api/admin/reviews?reported=1")
    .set("x-csrf-token", adminAuth.csrf);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.data.pagination.total, 1);
  assert.equal(queue.body.data.reviews[0].reports[0].reason, "spam");
  assert.equal(queue.body.data.reviews[0].reports[0].details, "Repeated promotional content");

  const hidden = await adminAgent
    .patch(`/api/admin/reviews/${ownerReview._id}/moderation`)
    .set("x-csrf-token", adminAuth.csrf)
    .send({ status: "hidden", reason: "Nội dung vi phạm" });
  assert.equal(hidden.status, 200);
  let aggregate = await Book.findById(book._id).select("+ratingSum");
  assert.equal(aggregate.ratingSum, 4);
  assert.equal(aggregate.reviewCount, 1);
  assert.equal(aggregate.rating, 4);

  const publicReviews = await supertest(app).get(`/api/books/${book._id}/reviews`);
  assert.equal(publicReviews.body.data.pagination.total, 1);
  assert.equal(publicReviews.body.data.reviews.length, 1);

  const restored = await adminAgent
    .patch(`/api/admin/reviews/${ownerReview._id}/moderation`)
    .set("x-csrf-token", adminAuth.csrf)
    .send({ status: "visible" });
  assert.equal(restored.status, 200);
  aggregate = await Book.findById(book._id).select("+ratingSum");
  assert.equal(aggregate.ratingSum, 7);
  assert.equal(aggregate.reviewCount, 2);
  assert.equal(aggregate.rating, 3.5);

  const deleted = await ownerAgent
    .delete(`/api/books/${book._id}/reviews/${ownerReview._id}`)
    .set("x-csrf-token", ownerAuth.csrf);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.bookRating, 4);
  assert.equal(deleted.body.data.bookReviewCount, 1);
  assert.equal(await ReviewReport.countDocuments({ review: ownerReview._id }), 0);
});

test("concurrent review aggregates remain exact with atomic rating updates", async () => {
  const book = await Book.create({
    title: "Concurrent Rating Book",
    author: "Author",
    price: 100_000,
    stock: 10,
    category: "fiction",
  });
  const ratings = [1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 5, 4];
  const users = await User.create(
    ratings.map((_, index) => ({
      name: `Concurrent Reviewer ${index}`,
      email: `concurrent-reviewer-${index}@example.com`,
      password: "secure-password",
    }))
  );

  await Promise.all(
    ratings.map(async (rating, index) => {
      await Review.create({
        book: book._id,
        user: users[index]._id,
        userName: users[index].name,
        rating,
        comment: `Concurrent review with rating ${rating}`,
      });
      await Book.addRating(book._id, rating);
    })
  );

  const updated = await Book.findById(book._id).select(
    "+ratingSum +ratingAggregateVersion"
  );
  const expectedSum = ratings.reduce((sum, rating) => sum + rating, 0);
  assert.equal(updated.ratingSum, expectedSum);
  assert.equal(updated.reviewCount, ratings.length);
  assert.equal(updated.rating, Math.round((expectedSum / ratings.length) * 10) / 10);
  assert.equal(updated.ratingAggregateVersion, 1);
});

test("legacy books backfill exact rating aggregates once", async () => {
  const book = await Book.create({
    title: "Legacy Rating Book",
    author: "Author",
    price: 100_000,
    stock: 10,
    category: "fiction",
  });
  const users = await User.create(
    [1, 5].map((rating) => ({
      name: `Legacy Reviewer ${rating}`,
      email: `legacy-reviewer-${rating}@example.com`,
      password: "secure-password",
    }))
  );
  await Review.create(
    users.map((user, index) => ({
      book: book._id,
      user: user._id,
      userName: user.name,
      rating: index === 0 ? 1 : 5,
      comment: "A legacy review with sufficient length",
    }))
  );
  await Book.collection.updateOne(
    { _id: book._id },
    {
      $set: { rating: 1, reviewCount: 1 },
      $unset: { ratingSum: "", ratingAggregateVersion: "" },
    }
  );

  assert.equal(await Book.migrateRatingAggregates(), 1);
  assert.equal(await Book.migrateRatingAggregates(), 0);
  const migrated = await Book.findById(book._id).select(
    "+ratingSum +ratingAggregateVersion"
  );
  assert.equal(migrated.ratingSum, 6);
  assert.equal(migrated.reviewCount, 2);
  assert.equal(migrated.rating, 3);
  assert.equal(migrated.ratingAggregateVersion, 1);
});
