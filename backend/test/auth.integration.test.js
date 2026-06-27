process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";
process.env.JWT_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

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

function cookieValue(response, name) {
  const cookies = response.headers["set-cookie"] || [];
  const entry = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? entry.split(";", 1)[0].slice(name.length + 1) : "";
}

async function register(agent, email = "session@example.com") {
  return agent.post("/api/auth/register").send({
    name: "Session User",
    email,
    password: "secure-password",
  });
}

test("cookie session enforces CSRF, rotates refresh and revokes on logout", async () => {
  const agent = supertest.agent(app);
  const registered = await register(agent);

  assert.equal(registered.status, 201);
  assert.equal(Object.hasOwn(registered.body.data, "token"), false);
  assert.equal(registered.body.data.verificationRequired, true);
  assert.match(registered.body.data.verificationUrl, /\/verify-email\?token=/);
  assert.ok(
    (
      await User.findByEmail("session@example.com").select(
        "+emailVerificationTokenHash"
      )
    ).emailVerificationTokenHash
  );
  assert.ok(cookieValue(registered, "bookshop_access"));
  const oldRefresh = cookieValue(registered, "bookshop_refresh");
  const oldCsrf = registered.body.data.csrfToken;
  assert.ok(oldRefresh);
  assert.ok(oldCsrf);

  assert.equal((await agent.get("/api/auth/me")).status, 200);
  assert.equal(
    (await agent.put("/api/auth/me").send({ name: "Blocked" })).status,
    403
  );
  assert.equal(
    (
      await agent
        .put("/api/auth/me")
        .set("x-csrf-token", oldCsrf)
        .send({ name: "Allowed" })
    ).status,
    200
  );

  const refreshed = await agent
    .post("/api/auth/refresh")
    .set("x-csrf-token", oldCsrf)
    .send({});
  assert.equal(refreshed.status, 200);
  const nextCsrf = refreshed.body.data.csrfToken;
  assert.notEqual(nextCsrf, oldCsrf);

  const replayedRefresh = await supertest(app)
    .post("/api/auth/refresh")
    .set("Cookie", [
      `bookshop_refresh=${oldRefresh}`,
      `bookshop_csrf=${oldCsrf}`,
    ])
    .set("x-csrf-token", oldCsrf)
    .send({});
  assert.equal(replayedRefresh.status, 401);

  const loggedOut = await agent
    .post("/api/auth/logout")
    .set("x-csrf-token", nextCsrf)
    .send({});
  assert.equal(loggedOut.status, 200);
  assert.equal(await AuthSession.countDocuments({ revokedAt: null }), 0);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
});

test("a refresh cookie can bootstrap CSRF after local browser storage is cleared", async () => {
  await User.create({
    name: "CSRF Bootstrap User",
    email: "csrf-bootstrap@example.com",
    password: "secure-password",
  });
  const loggedIn = await supertest(app).post("/api/auth/login").send({
    email: "csrf-bootstrap@example.com",
    password: "secure-password",
  });
  const refresh = cookieValue(loggedIn, "bookshop_refresh");
  const csrfCookie = cookieValue(loggedIn, "bookshop_csrf");
  const cookies = [
    `bookshop_refresh=${refresh}`,
    `bookshop_csrf=${csrfCookie}`,
  ];

  const bootstrap = await supertest(app)
    .get("/api/auth/csrf")
    .set("Cookie", cookies);
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.headers["cache-control"], "no-store");
  assert.equal(bootstrap.body.data.csrfToken, csrfCookie);

  const refreshed = await supertest(app)
    .post("/api/auth/refresh")
    .set("Cookie", cookies)
    .set("x-csrf-token", bootstrap.body.data.csrfToken)
    .send({});
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.data.csrfToken);
});

test("password change revokes every existing session", async () => {
  const firstAgent = supertest.agent(app);
  const secondAgent = supertest.agent(app);
  const firstLogin = await register(firstAgent, "password@example.com");
  const firstCsrf = firstLogin.body.data.csrfToken;
  const secondLogin = await secondAgent.post("/api/auth/login").send({
    email: "password@example.com",
    password: "secure-password",
  });
  const secondCsrf = secondLogin.body.data.csrfToken;
  assert.equal(await AuthSession.countDocuments({ revokedAt: null }), 2);

  const changed = await firstAgent
    .patch("/api/auth/me/password")
    .set("x-csrf-token", firstCsrf)
    .send({
      currentPassword: "secure-password",
      newPassword: "new-secure-password",
    });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.reauthRequired, true);
  assert.equal(await AuthSession.countDocuments({ revokedAt: null }), 0);

  assert.equal((await firstAgent.get("/api/auth/me")).status, 401);
  assert.equal((await secondAgent.get("/api/auth/me")).status, 401);
  const staleRefresh = await secondAgent
    .post("/api/auth/refresh")
    .set("x-csrf-token", secondCsrf)
    .send({});
  assert.equal(staleRefresh.status, 401);
});

test("concurrent refresh rotation accepts the token only once", async () => {
  const registered = await register(supertest(app), "race@example.com");
  const refresh = cookieValue(registered, "bookshop_refresh");
  const csrf = registered.body.data.csrfToken;
  const cookie = [`bookshop_refresh=${refresh}`, `bookshop_csrf=${csrf}`];

  const responses = await Promise.all([
    supertest(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrf)
      .send({}),
    supertest(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrf)
      .send({}),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 401]
  );
});

test("auth endpoints reject operator-shaped and weak credential input", async () => {
  const agent = supertest.agent(app);
  const operatorEmail = await agent.post("/api/auth/login").send({
    email: { $ne: null },
    password: "secure-password",
  });
  assert.equal(operatorEmail.status, 400);

  const weakRegistration = await agent.post("/api/auth/register").send({
    name: "Weak User",
    email: "weak@example.com",
    password: "short7",
  });
  assert.equal(weakRegistration.status, 400);

  const registered = await register(agent, "validation@example.com");
  const invalidProfile = await agent
    .put("/api/auth/me")
    .set("x-csrf-token", registered.body.data.csrfToken)
    .send({ name: { $gt: "" } });
  assert.equal(invalidProfile.status, 400);
});
