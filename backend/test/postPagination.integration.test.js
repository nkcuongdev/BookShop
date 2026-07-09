process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Post = require("../src/models/Post");
const User = require("../src/models/User");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), Post.syncIndexes()]);
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

test("post pagination and sorting are bounded for public and admin APIs", async () => {
  const admin = await User.create({
    name: "Post Admin",
    email: "post-admin@example.com",
    password: "secure-password",
    role: "admin",
  });
  await Post.create(
    Array.from({ length: 25 }, (_, index) => ({
      title: `Post ${index}`,
      slug: `post-${index}`,
      content: "Post content",
      author: admin._id,
      status: "published",
      publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
      viewCount: index,
    }))
  );

  const publicResponse = await supertest(app).get(
    "/api/posts?page=not-a-number&limit=0&sortBy=%24where&order=sideways"
  );
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.body.data.posts.length, 10);
  assert.equal(publicResponse.body.data.pagination.page, 1);
  assert.equal(publicResponse.body.data.pagination.limit, 10);
  assert.equal(publicResponse.body.data.posts[0].slug, "post-24");

  const latestResponse = await supertest(app).get("/api/posts/latest?limit=999999");
  assert.equal(latestResponse.status, 200);
  assert.equal(latestResponse.body.data.posts.length, 20);

  const agent = supertest.agent(app);
  const login = await agent.post("/api/auth/login").send({
    email: admin.email,
    password: "secure-password",
  });
  assert.equal(login.status, 200);
  const adminResponse = await agent.get(
    "/api/posts/admin/all?page=-3&limit=999999&sortBy=content&order=invalid"
  );
  assert.equal(adminResponse.status, 200);
  assert.equal(adminResponse.body.data.pagination.page, 1);
  assert.equal(adminResponse.body.data.pagination.limit, 100);
  assert.equal(adminResponse.body.data.posts.length, 25);
});
