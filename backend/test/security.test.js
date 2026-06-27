process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const supertest = require("supertest");

const app = require("../src/index");
const { sanitizeRichText } = require("../src/utils/security");
const { assertSeedAllowed, buildSeedUsers } = require("../src/seed");

test("rich post HTML removes executable markup and unsafe URLs", () => {
  const dirty = [
    '<p onclick="alert(1)">Safe text</p>',
    '<script>alert(1)</script>',
    '<a href="javascript:alert(1)" target="_blank">bad</a>',
    '<a href="https://example.com" target="_blank">good</a>',
    '<img src="data:text/html,<script>alert(1)</script>" onerror="alert(1)">',
  ].join("");

  const clean = sanitizeRichText(dirty);
  assert.doesNotMatch(clean, /script|onclick|onerror|javascript:|data:/i);
  assert.match(clean, /href="https:\/\/example\.com"/);
  assert.match(clean, /rel="noopener noreferrer"/);
});

test("API responses include baseline browser security headers", async () => {
  const response = await supertest(app).get("/");
  assert.equal(response.status, 200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.ok(response.headers["content-security-policy"]);
  assert.ok(response.headers["referrer-policy"]);
});

test("destructive seed requires explicit development confirmation and strong credentials", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousConfirm = process.env.SEED_CONFIRM;
  const previousAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  const previousUserPassword = process.env.SEED_USER_PASSWORD;
  try {
    process.env.NODE_ENV = "test";
    delete process.env.SEED_CONFIRM;
    assert.throws(assertSeedAllowed, /Refusing destructive seed/);

    process.env.SEED_CONFIRM = "RESET_BOOKSHOP_DATA";
    assert.doesNotThrow(assertSeedAllowed);
    process.env.NODE_ENV = "production";
    assert.throws(assertSeedAllowed, /disabled in production/);

    delete process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_USER_PASSWORD;
    const generated = buildSeedUsers();
    assert.ok(generated.adminPassword.length >= 20);
    assert.ok(generated.userPassword.length >= 20);
    assert.notEqual(generated.adminPassword, generated.userPassword);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousConfirm === undefined) delete process.env.SEED_CONFIRM;
    else process.env.SEED_CONFIRM = previousConfirm;
    if (previousAdminPassword === undefined) delete process.env.SEED_ADMIN_PASSWORD;
    else process.env.SEED_ADMIN_PASSWORD = previousAdminPassword;
    if (previousUserPassword === undefined) delete process.env.SEED_USER_PASSWORD;
    else process.env.SEED_USER_PASSWORD = previousUserPassword;
  }
});

test("production refuses process-local rate limits without Redis", () => {
  const result = spawnSync(
    process.execPath,
    ["-e", "require('./src/config')"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        JWT_SECRET: "a".repeat(64),
        JWT_REFRESH_SECRET: "b".repeat(64),
        RATE_LIMIT_REDIS_URL: "",
        REDIS_URL: "",
      },
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /RATE_LIMIT_REDIS_URL/);
});
