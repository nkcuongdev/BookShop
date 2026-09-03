process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const bcrypt = require("bcryptjs");
const supertest = require("supertest");

const app = require("../src/index");
const config = require("../src/config");
const AnalyticsEvent = require("../src/models/AnalyticsEvent");
const User = require("../src/models/User");

test("login uses a dummy bcrypt check and an IP quota across rotated emails", async () => {
  const originalFindByEmail = User.findByEmail;
  const originalCompare = bcrypt.compare;
  let dummyComparisons = 0;
  User.findByEmail = () => ({ select: async () => null });
  bcrypt.compare = async () => {
    dummyComparisons += 1;
    return false;
  };

  try {
    const statuses = [];
    for (let index = 0; index < 31; index += 1) {
      const response = await supertest(app).post("/api/auth/login").send({
        email: `rotated-${index}@example.com`,
        password: "secure-password",
      });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses.slice(0, 30), Array(30).fill(401));
    assert.equal(statuses[30], 429);
    assert.equal(dummyComparisons, 30);
  } finally {
    User.findByEmail = originalFindByEmail;
    bcrypt.compare = originalCompare;
  }
});

test("analytics IP quota cannot be bypassed by rotating session IDs", async () => {
  const statuses = [];
  for (let index = 0; index < 121; index += 1) {
    const response = await supertest(app).post("/api/events").send({
      type: "unsupported",
      sessionId: `rotating_session_${String(index).padStart(4, "0")}`,
    });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses.slice(0, 120), Array(120).fill(400));
  assert.equal(statuses[120], 429);
});

test("raw analytics events have a bounded retention TTL index", () => {
  const ttlIndex = AnalyticsEvent.schema
    .indexes()
    .find(
      ([fields, options]) =>
        fields.createdAt === 1 && Number.isFinite(options.expireAfterSeconds)
    );
  assert.ok(ttlIndex);
  assert.equal(ttlIndex[1].expireAfterSeconds, config.analytics.retentionSeconds);
  assert.equal(config.analytics.retentionSeconds, 365 * 24 * 60 * 60);
});
