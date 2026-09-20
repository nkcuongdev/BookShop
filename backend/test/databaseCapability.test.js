process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { assertTransactionSupport } = require("../src/config/db");

function connectionFor(hello) {
  return {
    db: {
      admin: () => ({ command: async () => hello }),
    },
  };
}

test("database capability accepts replica sets and mongos", async () => {
  await assert.doesNotReject(() =>
    assertTransactionSupport(connectionFor({ setName: "rs0" }))
  );
  await assert.doesNotReject(() =>
    assertTransactionSupport(connectionFor({ msg: "isdbgrid" }))
  );
});

test("database capability rejects standalone MongoDB", async () => {
  await assert.rejects(
    () => assertTransactionSupport(connectionFor({ isWritablePrimary: true })),
    /transactions are required/i
  );
});
