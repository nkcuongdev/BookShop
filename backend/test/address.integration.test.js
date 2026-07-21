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

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.syncIndexes();
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

test("address fields and per-user address count are bounded", async () => {
  const user = await User.create({
    name: "Address User",
    email: "address-user@example.com",
    password: "secure-password",
  });
  const agent = supertest.agent(app);
  const login = await agent.post("/api/auth/login").send({
    email: user.email,
    password: "secure-password",
  });
  assert.equal(login.status, 200);
  const csrf = login.body.data.csrfToken;

  const oversized = await agent
    .post("/api/auth/me/addresses")
    .set("x-csrf-token", csrf)
    .send({
      label: "x".repeat(41),
      fullName: "Customer",
      phone: "0900000000",
      address: "1 Test Street",
    });
  assert.equal(oversized.status, 422);
  assert.equal(oversized.body.code, "INVALID_ADDRESS");

  const oversizedAdministrativeUnit = await agent
    .post("/api/auth/me/addresses")
    .set("x-csrf-token", csrf)
    .send({
      label: "Nhà",
      fullName: "Customer",
      phone: "0900000000",
      address: "1 Test Street",
      city: "x".repeat(101),
    });
  assert.equal(oversizedAdministrativeUnit.status, 422);
  assert.equal(oversizedAdministrativeUnit.body.code, "INVALID_ADDRESS");

  for (let index = 0; index < 10; index += 1) {
    const response = await agent
      .post("/api/auth/me/addresses")
      .set("x-csrf-token", csrf)
      .send({
        label: `Address ${index}`,
        fullName: "Customer",
        phone: "0900000000",
        address: `${index} Test Street`,
        ...(index === 0
          ? {
              city: "Thành phố Hà Nội",
              district: "Quận Ba Đình",
              ward: "Phường Ba Đình",
            }
          : {}),
      });
    assert.equal(response.status, 200);
  }

  let persisted = await User.findById(user._id);
  assert.equal(persisted.addresses[0].city, "Thành phố Hà Nội");
  assert.equal(persisted.addresses[0].district, "Quận Ba Đình");
  assert.equal(persisted.addresses[0].ward, "Phường Ba Đình");

  const updated = await agent
    .put(`/api/auth/me/addresses/${persisted.addresses[0]._id}`)
    .set("x-csrf-token", csrf)
    .send({
      label: "Nhà",
      fullName: "Customer",
      phone: "0900000000",
      address: "1 Updated Street",
      city: "Thành phố Hồ Chí Minh",
      district: "",
      ward: "Phường Sài Gòn",
    });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.addresses[0].city, "Thành phố Hồ Chí Minh");
  assert.equal(updated.body.data.addresses[0].district, "");
  assert.equal(updated.body.data.addresses[0].ward, "Phường Sài Gòn");

  const overLimit = await agent
    .post("/api/auth/me/addresses")
    .set("x-csrf-token", csrf)
    .send({
      label: "Too many",
      fullName: "Customer",
      phone: "0900000000",
      address: "Last Test Street",
    });
  assert.equal(overLimit.status, 422);
  assert.equal(overLimit.body.code, "ADDRESS_LIMIT_REACHED");
  persisted = await User.findById(user._id);
  assert.equal(persisted.addresses.length, 10);
});
