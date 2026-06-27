process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const AuthSession = require("../src/models/AuthSession");
const User = require("../src/models/User");

let replicaSet;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([User.syncIndexes(), AuthSession.syncIndexes()]);
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

async function register(agent, email) {
  return agent.post("/api/auth/register").send({
    name: "Recovery User",
    email,
    password: "secure-password",
  });
}

function tokenFromUrl(url) {
  return new URL(url).searchParams.get("token");
}

test("password reset is enumeration-safe, one-time and revokes active sessions", async () => {
  const agent = supertest.agent(app);
  const registered = await register(agent, "recovery@example.com");
  assert.equal(registered.status, 201);

  const unknown = await supertest(app)
    .post("/api/auth/forgot-password")
    .send({ email: "unknown@example.com" });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.data, undefined);

  const requested = await supertest(app)
    .post("/api/auth/forgot-password")
    .send({ email: "recovery@example.com" });
  assert.equal(requested.status, 200);
  const token = tokenFromUrl(requested.body.data.resetUrl);
  assert.match(token, /^[a-f0-9]{64}$/);

  const reset = await supertest(app).post("/api/auth/reset-password").send({
    token,
    password: "new-secure-password",
  });
  assert.equal(reset.status, 200);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  assert.equal(await AuthSession.countDocuments({ revokedAt: null }), 0);

  const replay = await supertest(app).post("/api/auth/reset-password").send({
    token,
    password: "another-secure-password",
  });
  assert.equal(replay.status, 400);

  assert.equal(
    (
      await supertest(app).post("/api/auth/login").send({
        email: "recovery@example.com",
        password: "secure-password",
      })
    ).status,
    401
  );
  assert.equal(
    (
      await supertest(app).post("/api/auth/login").send({
        email: "recovery@example.com",
        password: "new-secure-password",
      })
    ).status,
    200
  );
});

test("password reset rolls back token consumption and password when session revocation fails", async () => {
  await User.create({
    name: "Recovery Rollback User",
    email: "recovery-rollback@example.com",
    password: "secure-password",
  });
  const requested = await supertest(app)
    .post("/api/auth/forgot-password")
    .send({ email: "recovery-rollback@example.com" });
  const token = tokenFromUrl(requested.body.data.resetUrl);

  const originalUpdateMany = AuthSession.updateMany;
  AuthSession.updateMany = async () => {
    throw new Error("injected session revocation failure");
  };
  let response;
  try {
    response = await supertest(app).post("/api/auth/reset-password").send({
      token,
      password: "new-password-must-rollback",
    });
  } finally {
    AuthSession.updateMany = originalUpdateMany;
  }
  assert.equal(response.status, 500);

  const unchanged = await User.findByEmail("recovery-rollback@example.com").select(
    "+passwordResetTokenHash +tokenVersion"
  );
  assert.ok(unchanged.passwordResetTokenHash);
  assert.equal(unchanged.tokenVersion, 0);
  assert.equal(await unchanged.comparePassword("secure-password"), true);
  assert.equal(await unchanged.comparePassword("new-password-must-rollback"), false);

  const retry = await supertest(app).post("/api/auth/reset-password").send({
    token,
    password: "new-password-after-retry",
  });
  assert.equal(retry.status, 200);
});

test("email verification token is expiring, one-time and reflected by /me", async () => {
  const agent = supertest.agent(app);
  const registered = await register(agent, "verify@example.com");
  const csrf = registered.body.data.csrfToken;
  assert.equal(registered.body.data.user.emailVerified, false);

  const requested = await agent
    .post("/api/auth/email-verification/request")
    .set("x-csrf-token", csrf)
    .send({});
  assert.equal(requested.status, 200);
  const token = tokenFromUrl(requested.body.data.verificationUrl);

  const verified = await supertest(app)
    .post("/api/auth/email-verification/verify")
    .send({ token });
  assert.equal(verified.status, 200);

  const me = await agent.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.emailVerified, true);

  const replay = await supertest(app)
    .post("/api/auth/email-verification/verify")
    .send({ token });
  assert.equal(replay.status, 400);
});

test("email change requires the current password and verification at the new address", async () => {
  const agent = supertest.agent(app);
  const registered = await register(agent, "old-email@example.com");
  const csrf = registered.body.data.csrfToken;

  const withoutPassword = await agent
    .put("/api/auth/me")
    .set("x-csrf-token", csrf)
    .send({ email: "new-email@example.com" });
  assert.equal(withoutPassword.status, 400);
  assert.equal((await User.findByEmail("old-email@example.com")).pendingEmail, null);

  const wrongPassword = await agent
    .put("/api/auth/me")
    .set("x-csrf-token", csrf)
    .send({
      email: "new-email@example.com",
      currentPassword: "incorrect-password",
    });
  assert.equal(wrongPassword.status, 400);

  const requested = await agent
    .put("/api/auth/me")
    .set("x-csrf-token", csrf)
    .send({
      email: "new-email@example.com",
      currentPassword: "secure-password",
    });
  assert.equal(requested.status, 200);
  assert.equal(requested.body.data.user.email, "old-email@example.com");
  assert.equal(requested.body.data.user.pendingEmail, "new-email@example.com");
  assert.equal(requested.body.data.emailChangePending, true);
  const changeToken = tokenFromUrl(requested.body.data.verificationUrl);

  const resetRequested = await supertest(app)
    .post("/api/auth/forgot-password")
    .send({ email: "old-email@example.com" });
  const staleResetToken = tokenFromUrl(resetRequested.body.data.resetUrl);

  const changed = await supertest(app)
    .post("/api/auth/email-verification/verify")
    .send({ token: changeToken });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.emailChanged, true);
  assert.equal(changed.body.data.reauthRequired, true);

  const updatedUser = await User.findByEmail("new-email@example.com").select(
    "+passwordResetTokenHash +emailChangeTokenHash +tokenVersion"
  );
  assert.ok(updatedUser.emailVerifiedAt);
  assert.equal(updatedUser.pendingEmail, null);
  assert.equal(updatedUser.passwordResetTokenHash, null);
  assert.equal(updatedUser.emailChangeTokenHash, null);
  assert.equal(updatedUser.tokenVersion, 1);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  assert.equal(await AuthSession.countDocuments({ revokedAt: null }), 0);

  const staleReset = await supertest(app).post("/api/auth/reset-password").send({
    token: staleResetToken,
    password: "attacker-password",
  });
  assert.equal(staleReset.status, 400);
  assert.equal(
    (
      await supertest(app).post("/api/auth/login").send({
        email: "old-email@example.com",
        password: "secure-password",
      })
    ).status,
    401
  );
  assert.equal(
    (
      await supertest(app).post("/api/auth/login").send({
        email: "new-email@example.com",
        password: "secure-password",
      })
    ).status,
    200
  );

  const replay = await supertest(app)
    .post("/api/auth/email-verification/verify")
    .send({ token: changeToken });
  assert.equal(replay.status, 400);
});

test("password change and recovery invalidate pending email-change links", async () => {
  for (const mode of ["change", "reset"]) {
    const email = `${mode}-cancels-email-change@example.com`;
    const agent = supertest.agent(app);
    await User.create({
      name: "Recovery Owner",
      email,
      password: "secure-password",
    });
    const loggedIn = await agent.post("/api/auth/login").send({
      email,
      password: "secure-password",
    });
    const csrf = loggedIn.body.data.csrfToken;
    const requested = await agent
      .put("/api/auth/me")
      .set("x-csrf-token", csrf)
      .send({
        email: `${mode}-pending@example.com`,
        currentPassword: "secure-password",
      });
    const emailChangeToken = tokenFromUrl(
      requested.body.data.verificationUrl
    );

    if (mode === "change") {
      const changed = await agent
        .patch("/api/auth/me/password")
        .set("x-csrf-token", csrf)
        .send({
          currentPassword: "secure-password",
          newPassword: "owner-changed-password",
        });
      assert.equal(changed.status, 200);
    } else {
      const resetRequested = await supertest(app)
        .post("/api/auth/forgot-password")
        .send({ email });
      const resetToken = tokenFromUrl(resetRequested.body.data.resetUrl);
      const reset = await supertest(app)
        .post("/api/auth/reset-password")
        .send({ token: resetToken, password: "owner-reset-password" });
      assert.equal(reset.status, 200);
    }

    const staleChange = await supertest(app)
      .post("/api/auth/email-verification/verify")
      .send({ token: emailChangeToken });
    assert.equal(staleChange.status, 400);
    const owner = await User.findByEmail(email).select(
      "+emailChangeTokenHash +emailChangeExpiresAt"
    );
    assert.equal(owner.pendingEmail, null);
    assert.equal(owner.emailChangeTokenHash, null);
    assert.equal(owner.emailChangeExpiresAt, null);
  }
});

test("email change rechecks uniqueness when the verification link is consumed", async () => {
  const agent = supertest.agent(app);
  const registered = await register(agent, "uniqueness-old@example.com");
  const requested = await agent
    .put("/api/auth/me")
    .set("x-csrf-token", registered.body.data.csrfToken)
    .send({
      email: "claimed-later@example.com",
      currentPassword: "secure-password",
    });
  const token = tokenFromUrl(requested.body.data.verificationUrl);

  const competingRegistration = await register(
    supertest(app),
    "claimed-later@example.com"
  );
  assert.equal(competingRegistration.status, 201);

  const conflict = await supertest(app)
    .post("/api/auth/email-verification/verify")
    .send({ token });
  assert.equal(conflict.status, 409);
  assert.ok(await User.findByEmail("uniqueness-old@example.com"));
  assert.equal(
    (await User.findByEmail("uniqueness-old@example.com")).pendingEmail,
    "claimed-later@example.com"
  );
});
