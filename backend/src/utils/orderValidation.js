const mongoose = require("mongoose");

const SHIPPING_METHODS = Object.freeze({
  standard: Object.freeze({ fee: 0 }),
  express: Object.freeze({ fee: 25_000 }),
});

// Kept equal to MAX_CART_ITEMS: every purchasable line in a valid cart can be
// checked out in one order.
const MAX_ITEMS = 100;
const MAX_ITEM_QUANTITY = 99;

function validationError(message, field) {
  const error = new Error(message);
  error.code = "ORDER_VALIDATION_ERROR";
  error.field = field;
  return error;
}

function requiredString(value, field, { min = 1, max }) {
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`, field);
  }
  const normalized = value.trim();
  if (normalized.length < min || (max && normalized.length > max)) {
    throw validationError(
      `${field} must contain ${min}-${max || "unlimited"} characters`,
      field
    );
  }
  return normalized;
}

function optionalString(value, field, max) {
  if (value === undefined || value === null || value === "") return "";
  return requiredString(value, field, { min: 0, max });
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw validationError("Cart is empty", "items");
  }
  if (items.length > MAX_ITEMS) {
    throw validationError(`An order can contain at most ${MAX_ITEMS} books`, "items");
  }

  const seen = new Set();
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw validationError(`items[${index}] is invalid`, `items.${index}`);
    }
    if (
      typeof item.bookId !== "string" ||
      !mongoose.Types.ObjectId.isValid(item.bookId)
    ) {
      throw validationError(
        `items[${index}].bookId is invalid`,
        `items.${index}.bookId`
      );
    }
    const bookId = item.bookId.trim();
    if (seen.has(bookId)) {
      throw validationError("Duplicate books are not allowed", "items");
    }
    seen.add(bookId);

    const quantity = Number(item.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw validationError(
        `items[${index}].quantity must be an integer from 1 to ${MAX_ITEM_QUANTITY}`,
        `items.${index}.quantity`
      );
    }
    const expectedUnitPrice =
      item.expectedUnitPrice === undefined || item.expectedUnitPrice === null
        ? null
        : Number(item.expectedUnitPrice);
    if (
      expectedUnitPrice !== null &&
      (!Number.isInteger(expectedUnitPrice) || expectedUnitPrice < 0)
    ) {
      throw validationError(
        `items[${index}].expectedUnitPrice is invalid`,
        `items.${index}.expectedUnitPrice`
      );
    }
    return { bookId, quantity, expectedUnitPrice };
  });
}

function normalizeShippingAddress(address) {
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    throw validationError("Shipping address is required", "shippingAddress");
  }

  const phone = requiredString(address.phone, "shippingAddress.phone", {
    min: 9,
    max: 20,
  }).replace(/[\s-]/g, "");
  if (!/^\+?[0-9]{9,15}$/.test(phone)) {
    throw validationError("Shipping phone number is invalid", "shippingAddress.phone");
  }

  const city = optionalString(address.city, "shippingAddress.city", 100);
  const district = optionalString(
    address.district,
    "shippingAddress.district",
    100
  );
  const ward = optionalString(address.ward, "shippingAddress.ward", 100);
  const hasAdministrativeAddress = Boolean(city || district || ward);

  return {
    fullName: requiredString(address.fullName, "shippingAddress.fullName", {
      min: 2,
      max: 100,
    }),
    phone,
    address: requiredString(address.address, "shippingAddress.address", {
      min: hasAdministrativeAddress ? 3 : 10,
      max: 500,
    }),
    city,
    district,
    ward,
  };
}

function normalizeShippingMethod(shippingMethod, legacyShippingFee) {
  let method = shippingMethod;
  // Backward compatibility for the old client, which only sent shippingFee.
  if (!method) {
    method = Number(legacyShippingFee) === SHIPPING_METHODS.express.fee
      ? "express"
      : "standard";
  }
  if (typeof method !== "string" || !SHIPPING_METHODS[method]) {
    throw validationError("Shipping method is invalid", "shippingMethod");
  }
  return method;
}

/**
 * Loyalty points the customer wants to spend.
 *
 * Normalised here rather than in the service because the result feeds the
 * idempotency hash: two requests sharing a key but differing in points must not
 * be treated as a replay, or the second one silently returns the first order
 * and the customer believes they spent points they still hold.
 */
function normalizePointsToRedeem(value) {
  if (value === undefined || value === null || value === "") return 0;
  const points = Number(value);
  if (!Number.isInteger(points) || points < 0 || points > 10_000_000) {
    throw validationError(
      "pointsToRedeem must be a non-negative integer",
      "pointsToRedeem"
    );
  }
  return points;
}

function normalizeExpectedTotal(value) {
  if (value === undefined || value === null || value === "") return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000_000) {
    throw validationError(
      "expectedTotal must be a non-negative integer",
      "expectedTotal"
    );
  }
  return amount;
}

function validateOrderInput({
  items,
  shippingAddress,
  paymentMethod,
  voucherCode,
  orderVoucherCode,
  shippingVoucherCode,
  shippingMethod,
  legacyShippingFee,
  note,
  pointsToRedeem,
  checkoutSource,
  expectedTotal,
}) {
  const normalizedShippingMethod = normalizeShippingMethod(
    shippingMethod,
    legacyShippingFee
  );
  const normalizedVoucherCode = optionalString(voucherCode, "voucherCode", 50)
    .toUpperCase();
  const normalizedOrderVoucherCode = optionalString(
    orderVoucherCode,
    "orderVoucherCode",
    50
  ).toUpperCase();
  const normalizedShippingVoucherCode = optionalString(
    shippingVoucherCode,
    "shippingVoucherCode",
    50
  ).toUpperCase();
  if (
    normalizedOrderVoucherCode &&
    normalizedOrderVoucherCode === normalizedShippingVoucherCode
  ) {
    throw validationError(
      "Order and shipping vouchers must be different",
      "shippingVoucherCode"
    );
  }
  const normalizedCheckoutSource = String(checkoutSource || "CART").toUpperCase();
  if (!["CART", "BUY_NOW"].includes(normalizedCheckoutSource)) {
    throw validationError("checkoutSource is invalid", "checkoutSource");
  }

  return {
    items: normalizeItems(items),
    shippingAddress: normalizeShippingAddress(shippingAddress),
    paymentMethod,
    voucherCode: normalizedVoucherCode,
    orderVoucherCode: normalizedOrderVoucherCode,
    shippingVoucherCode: normalizedShippingVoucherCode,
    shippingMethod: normalizedShippingMethod,
    shippingFee: SHIPPING_METHODS[normalizedShippingMethod].fee,
    note: optionalString(note, "note", 1_000),
    pointsToRedeem: normalizePointsToRedeem(pointsToRedeem),
    checkoutSource: normalizedCheckoutSource,
    expectedTotal: normalizeExpectedTotal(expectedTotal),
  };
}

module.exports = {
  MAX_ITEMS,
  MAX_ITEM_QUANTITY,
  SHIPPING_METHODS,
  validateOrderInput,
};
