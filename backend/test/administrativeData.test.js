process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret-with-sufficient-entropy";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-sufficient-entropy";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const {
  clearCache,
  getDistricts,
  getProvinces,
} = require("../src/services/vietnamAdministrativeService");
const { pickBookPayload } = require("../src/validators/bookValidator");

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  clearCache();
});

test("administrative data is normalized and cached server-side", async () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    assert.match(String(url), /provinces\.open-api\.vn\/api\/v2\/$/);
    return {
      ok: true,
      json: async () => [
        { code: 1, name: "Thành phố Hà Nội" },
        { code: "", name: "Invalid" },
      ],
    };
  };

  const first = await getProvinces("current");
  const second = await getProvinces("current");
  assert.deepEqual(first, [{ code: "1", name: "Thành phố Hà Nội" }]);
  assert.strictEqual(second, first);
  assert.equal(calls, 1);
});

test("administrative proxy rejects malformed codes without an outbound request", () => {
  global.fetch = async () => {
    throw new Error("must not be called");
  };
  assert.throws(() => getDistricts("../../admin"), (error) => {
    assert.equal(error.statusCode, 400);
    return true;
  });
});

test("book image validation matches the CSP allowlist", () => {
  assert.equal(
    pickBookPayload({ imageUrl: "https://res.cloudinary.com/demo/book.webp" })
      .imageUrl,
    "https://res.cloudinary.com/demo/book.webp"
  );
  assert.throws(
    () => pickBookPayload({ imageUrl: "https://untrusted.example/book.webp" }),
    /nguồn ảnh được cho phép/
  );
});
