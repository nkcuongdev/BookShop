process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const config = require("../src/config");
const { sendNotificationEmail } = require("../src/services/emailService");

const originalMail = { ...config.mail };
const originalFetch = global.fetch;

afterEach(() => {
  Object.assign(config.mail, originalMail);
  global.fetch = originalFetch;
});

test("Resend delivery uses the HTTPS API without SMTP", async () => {
  Object.assign(config.mail, {
    enabled: true,
    provider: "resend",
    resendApiKey: "re_test_key",
    from: "BookShop <mail@example.com>",
    requestTimeoutMs: 1_000,
  });
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer re_test_key");
    assert.equal(options.headers["User-Agent"], "bookshop-api/1.0");
    const body = JSON.parse(options.body);
    assert.equal(body.from, "BookShop <mail@example.com>");
    assert.equal(body.to, "reader@example.com");
    assert.equal(body.subject, "Account update");
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "email-id" }),
    };
  };

  const result = await sendNotificationEmail("reader@example.com", {
    title: "Account update",
    message: "Your account was updated.",
    link: "/profile",
  });
  assert.equal(result.delivered, true);
});

test("Resend provider errors remain visible to the caller", async () => {
  Object.assign(config.mail, {
    enabled: true,
    provider: "resend",
    resendApiKey: "re_invalid",
    requestTimeoutMs: 1_000,
  });
  global.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ message: "Domain is not verified" }),
  });

  await assert.rejects(
    sendNotificationEmail("reader@example.com", {
      title: "Account update",
      message: "Your account was updated.",
    }),
    /Domain is not verified/
  );
});
