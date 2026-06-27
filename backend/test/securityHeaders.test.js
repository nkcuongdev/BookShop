process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const supertest = require("supertest");
const app = require("../src/index");

test("API responses deny framing and expose a restrictive CSP", async () => {
  const response = await supertest(app).get("/api/health/live");
  assert.equal(response.status, 200);
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.match(response.headers["content-security-policy"], /default-src 'none'/);
  assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.doesNotMatch(response.headers["content-security-policy"], /https:/);
});
