process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  pickBookPayload,
  validateRequiredBookFields,
} = require("../src/validators/bookValidator");

function validPayload(overrides = {}) {
  return pickBookPayload({
    title: "Test Book",
    author: "Test Author",
    price: 0,
    stock: 0,
    category: "fiction",
    imageUrl: "https://res.cloudinary.com/demo/cover.webp",
    ...overrides,
  });
}

test("new books require a price, stock and cover image", () => {
  assert.throws(
    () => validateRequiredBookFields(validPayload({ stock: "" })),
    (error) => error.statusCode === 400 && /tồn kho/.test(error.message)
  );
  assert.throws(
    () => validateRequiredBookFields(validPayload({ price: "" })),
    (error) => error.statusCode === 400 && /giá bán/.test(error.message)
  );
  assert.throws(
    () => validateRequiredBookFields(validPayload({ imageUrl: "" })),
    (error) => error.statusCode === 400 && /ảnh bìa/.test(error.message)
  );
});

test("explicitly entered zero price and stock remain valid", () => {
  assert.doesNotThrow(() => validateRequiredBookFields(validPayload()));
});
