process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const User = require("../src/models/User");
const Voucher = require("../src/models/Voucher");
const VoucherRedemption = require("../src/models/VoucherRedemption");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Voucher.syncIndexes(),
    VoucherRedemption.syncIndexes(),
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

async function adminSession() {
  const user = await User.create({
    name: "Voucher Admin",
    email: "voucher-admin@example.com",
    password: "secure-password",
    role: "admin",
  });
  const agent = supertest.agent(app);
  const login = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(login.status, 200);
  return { agent, csrf: login.body.data.csrfToken };
}

async function userSession() {
  const user = await User.create({
    name: "Voucher Customer",
    email: "voucher-customer@example.com",
    password: "secure-password",
  });
  const agent = supertest.agent(app);
  const login = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(login.status, 200);
  return { agent, user };
}

function activeVoucher(overrides = {}) {
  return {
    code: "PUBLIC_SALE",
    type: "fixed",
    value: 50_000,
    minOrder: 0,
    maxDiscount: 0,
    startAt: new Date(Date.now() - 60_000),
    endAt: new Date(Date.now() + 60 * 60_000),
    usageLimit: 100,
    perUserLimit: 1,
    active: true,
    publicVisible: true,
    description: "Public campaign",
    ...overrides,
  };
}

function validVoucher(overrides = {}) {
  return {
    code: "DAY_SALE",
    type: "percent",
    value: 10,
    minOrder: 0,
    maxDiscount: 0,
    startAt: "2026-07-26",
    endAt: "2026-07-26",
    usageLimit: 100,
    perUserLimit: 1,
    active: true,
    description: "One Vietnam calendar day",
    ...overrides,
  };
}

test("voucher API validates cross-fields and stores Vietnam day boundaries", async () => {
  const { agent, csrf } = await adminSession();

  for (const payload of [
    validVoucher({ code: "TOO_MUCH", value: 101 }),
    validVoucher({ code: "bad-code" }),
    validVoucher({ code: "BAD_DATES", startAt: "2026-07-27" }),
    validVoucher({ code: "BAD_USER_LIMIT", usageLimit: 2, perUserLimit: 3 }),
  ]) {
    const response = await agent
      .post("/api/admin/vouchers")
      .set("x-csrf-token", csrf)
      .send(payload);
    assert.equal(response.status, 400);
  }

  const created = await agent
    .post("/api/admin/vouchers")
    .set("x-csrf-token", csrf)
    .send(validVoucher());
  assert.equal(created.status, 201);
  const voucher = await Voucher.findById(created.body.data.voucher._id);
  assert.equal(voucher.startAt.toISOString(), "2026-07-25T17:00:00.000Z");
  assert.equal(voucher.endAt.toISOString(), "2026-07-26T17:00:00.000Z");
  assert.equal(voucher.publicVisible, false);

  const fixedCreated = await agent
    .post("/api/admin/vouchers")
    .set("x-csrf-token", csrf)
    .send(
      validVoucher({
        code: "FIXED_NO_CAP",
        type: "fixed",
        value: 50_000,
        maxDiscount: 10_000,
      })
    );
  assert.equal(fixedCreated.status, 201);
  assert.equal(fixedCreated.body.data.voucher.maxDiscount, 0);

  const visibilityUpdate = await agent
    .put(`/api/admin/vouchers/${voucher._id}`)
    .set("x-csrf-token", csrf)
    .send({ publicVisible: true });
  assert.equal(visibilityUpdate.status, 200);
  assert.equal(visibilityUpdate.body.data.voucher.publicVisible, true);

  const invalidUpdate = await agent
    .put(`/api/admin/vouchers/${voucher._id}`)
    .set("x-csrf-token", csrf)
    .send({ value: 200, usedCount: 999 });
  assert.equal(invalidUpdate.status, 400);
  const unchanged = await Voucher.findById(voucher._id);
  assert.equal(unchanged.value, 10);
  assert.equal(unchanged.usedCount, 0);
});

test("public voucher list only exposes currently applicable opted-in campaigns", async () => {
  const now = Date.now();
  const privateVoucher = activeVoucher({ code: "PRIVATE_CODE" });
  delete privateVoucher.publicVisible;
  await Voucher.create([
    activeVoucher({ code: "PUBLIC_FIXED", value: 50_000 }),
    activeVoucher({
      code: "PUBLIC_PERCENT",
      type: "percent",
      value: 20,
      maxDiscount: 30_000,
    }),
    privateVoucher,
    activeVoucher({ code: "INACTIVE_CODE", active: false }),
    activeVoucher({
      code: "UPCOMING_CODE",
      startAt: new Date(now + 60_000),
    }),
    activeVoucher({
      code: "EXPIRED_CODE",
      startAt: new Date(now - 120_000),
      endAt: new Date(now - 60_000),
    }),
    activeVoucher({
      code: "USED_UP_CODE",
      usageLimit: 2,
      usedCount: 2,
    }),
    activeVoucher({ code: "HIGH_MINIMUM", minOrder: 250_001 }),
  ]);

  const response = await supertest(app)
    .get("/api/vouchers/available")
    .query({ subtotal: 250_000 });

  assert.equal(response.status, 200);
  assert.match(response.headers["cache-control"], /no-store/);
  assert.deepEqual(
    response.body.data.vouchers.map((voucher) => voucher.code),
    ["PUBLIC_FIXED", "PUBLIC_PERCENT"]
  );
  assert.equal(response.body.data.vouchers[0].discountAmount, 50_000);
  assert.equal(response.body.data.vouchers[1].discountAmount, 30_000);
  assert.deepEqual(
    Object.keys(response.body.data.vouchers[0]).sort(),
    [
      "code",
      "description",
      "discountAmount",
      "endAt",
      "maxDiscount",
      "minOrder",
      "scope",
      "type",
      "value",
    ].sort()
  );

  const invalidSubtotal = await supertest(app)
    .get("/api/vouchers/available")
    .query({ subtotal: "not-a-number" });
  assert.equal(invalidSubtotal.status, 400);
});

test("shipping vouchers discount only the actual shipping fee", async () => {
  await Voucher.create(
    activeVoucher({
      code: "FREESHIP50",
      scope: "shipping",
      value: 50_000,
    })
  );

  const response = await supertest(app).post("/api/vouchers/validate").send({
    code: "FREESHIP50",
    subtotal: 300_000,
    shippingFee: 25_000,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.discountAmount, 25_000);
  assert.equal(response.body.data.voucher.scope, "shipping");

  const pendingShipping = await supertest(app)
    .post("/api/vouchers/validate")
    .send({ code: "FREESHIP50", subtotal: 300_000 });
  assert.equal(pendingShipping.status, 200);
  assert.equal(pendingShipping.body.data.discountAmount, 0);

  const freeShippingList = await supertest(app)
    .get("/api/vouchers/available")
    .query({ subtotal: 300_000, shippingFee: 0 });
  assert.equal(freeShippingList.status, 200);
  assert.equal(freeShippingList.body.data.vouchers[0].code, "FREESHIP50");
  assert.equal(freeShippingList.body.data.vouchers[0].discountAmount, 0);

  const noShippingFee = await supertest(app)
    .post("/api/vouchers/validate")
    .send({ code: "FREESHIP50", subtotal: 300_000, shippingFee: 0 });
  assert.equal(noShippingFee.status, 400);
});

test("public voucher list hides campaigns whose per-user limit is exhausted", async () => {
  const voucher = await Voucher.create(activeVoucher());
  const { agent, user } = await userSession();
  await VoucherRedemption.create({
    voucher: voucher._id,
    user: user._id,
    usageCount: voucher.perUserLimit,
  });

  const anonymousResponse = await supertest(app)
    .get("/api/vouchers/available")
    .query({ subtotal: 100_000 });
  assert.deepEqual(
    anonymousResponse.body.data.vouchers.map((entry) => entry.code),
    [voucher.code]
  );

  const authenticatedResponse = await agent
    .get("/api/vouchers/available")
    .query({ subtotal: 100_000 });
  assert.equal(authenticatedResponse.status, 200);
  assert.deepEqual(authenticatedResponse.body.data.vouchers, []);
});
