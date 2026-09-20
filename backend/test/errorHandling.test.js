process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const {
  AppError,
  sanitizeErrorResponses,
  toPublicError,
} = require("../src/middleware/errorHandler");

test("error mapper exposes stable public codes without database details", () => {
  const validation = new mongoose.Error.ValidationError();
  validation.addError(
    "addresses.0.address",
    new mongoose.Error.ValidatorError({ message: "private schema detail" })
  );
  assert.deepEqual(toPublicError(validation), {
    statusCode: 422,
    code: "VALIDATION_FAILED",
    message: "Validation failed",
  });

  assert.deepEqual(toPublicError({ code: 11000, message: "duplicate key secret" }), {
    statusCode: 409,
    code: "CONFLICT",
    message: "Resource already exists",
  });

  const publicError = new AppError(403, "Not allowed", { code: "FORBIDDEN" });
  assert.deepEqual(toPublicError(publicError), {
    statusCode: 403,
    code: "FORBIDDEN",
    message: "Not allowed",
  });

  assert.deepEqual(toPublicError(new Error("database hostname secret")), {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
  });
});

test("legacy 4xx responses are scrubbed before leaving the API", () => {
  let output;
  const req = { id: "request-123" };
  const res = {
    statusCode: 400,
    json(body) {
      output = body;
      return body;
    },
  };
  sanitizeErrorResponses(req, res, () => {});
  res.json({
    success: false,
    message: "MongoServerError E11000 duplicate key private-index",
    error: "mongodb://private-host",
  });

  assert.deepEqual(output, {
    success: false,
    code: "REQUEST_FAILED",
    message: "Request could not be processed",
    requestId: "request-123",
  });
});
