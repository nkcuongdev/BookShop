process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const { clearReadinessCache } = require("../src/services/readinessService");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("liveness stays independent while readiness reflects Mongo state", async () => {
  clearReadinessCache();
  const ready = await supertest(app).get("/api/health/ready");
  assert.equal(ready.status, 200);
  assert.equal(ready.body.checks.mongo, "up");
  assert.equal(ready.body.checks.redis, "disabled");
  assert.equal(ready.body.checks.mail, "disabled");
  assert.equal(ready.body.checks.upload, "up");

  await mongoose.disconnect();
  clearReadinessCache();
  const [live, notReady] = await Promise.all([
    supertest(app).get("/api/health/live"),
    supertest(app).get("/api/health/ready"),
  ]);
  assert.equal(live.status, 200);
  assert.equal(notReady.status, 503);
  assert.equal(notReady.body.checks.mongo, "down");
  await mongoose.connect(mongo.getUri());
});

test("production config fails fast when displayed mail or upload features are missing", () => {
  const result = spawnSync(process.execPath, ["-e", "require('./src/config')"], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      JWT_SECRET: "a".repeat(64),
      JWT_REFRESH_SECRET: "b".repeat(64),
      RATE_LIMIT_REDIS_URL: "redis://127.0.0.1:6379",
      MONGO_URI: "mongodb://127.0.0.1:27017/bookshop",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      MAIL_FROM: "",
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
    },
  });
  assert.notEqual(result.status, 0);
  const output = `${result.stderr}${result.stdout}`;
  assert.match(output, /RESEND_API_KEY/);
  assert.match(output, /CLOUDINARY_CLOUD_NAME/);
});
