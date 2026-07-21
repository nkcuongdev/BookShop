const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const { validateOrderInput } = require("../src/utils/orderValidation");

function input(shippingAddress) {
  return {
    items: [{ bookId: new mongoose.Types.ObjectId().toString(), quantity: 1 }],
    shippingAddress,
    paymentMethod: "COD",
    shippingMethod: "standard",
  };
}

test("standardized administrative fields allow a concise detailed address", () => {
  const result = validateOrderInput(
    input({
      fullName: "Nguyễn Văn A",
      phone: "0900000000",
      address: "Số 1",
      city: "Thành phố Hà Nội",
      district: "",
      ward: "Phường Ba Đình",
    })
  );

  assert.equal(result.shippingAddress.address, "Số 1");
  assert.equal(result.shippingAddress.city, "Thành phố Hà Nội");
  assert.equal(result.shippingAddress.ward, "Phường Ba Đình");
});

test("free-form checkout still requires a sufficiently detailed address", () => {
  assert.throws(
    () =>
      validateOrderInput(
        input({
          fullName: "Nguyễn Văn A",
          phone: "0900000000",
          address: "Số 1",
        })
      ),
    (error) => error.field === "shippingAddress.address"
  );
});
