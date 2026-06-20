const { randomUUID } = require("crypto");

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{8,100}$/;

class AppError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message, options);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options.code || "REQUEST_FAILED";
  }
}

function toPublicError(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
    };
  }
  if (error?.name === "CastError") {
    return { statusCode: 400, code: "INVALID_ID", message: "Invalid resource identifier" };
  }
  if (error?.code === 11000) {
    return { statusCode: 409, code: "CONFLICT", message: "Resource already exists" };
  }
  if (error?.name === "ValidationError") {
    return { statusCode: 422, code: "VALIDATION_FAILED", message: "Validation failed" };
  }
  if (error?.name === "VersionError") {
    return {
      statusCode: 409,
      code: "CONCURRENT_MODIFICATION",
      message: "Resource changed concurrently; please retry",
    };
  }
  if (error?.type === "entity.parse.failed") {
    return { statusCode: 400, code: "INVALID_JSON", message: "Malformed JSON body" };
  }

  const rawStatus = Number(error?.statusCode || error?.status || 500);
  const statusCode = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  if (statusCode < 500) {
    return {
      statusCode,
      code:
        typeof error?.code === "string" && /^[A-Z0-9_]{3,60}$/.test(error.code)
          ? error.code
          : "REQUEST_FAILED",
      message: error?.message || "Request could not be processed",
    };
  }
  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
  };
}

function looksLikeInternalMessage(message) {
  return /(?:MongoServerError|Validation failed|validation failed|Cast to |VersionError|E11000|duplicate key|BSON|write conflict|stack|node_modules)/i.test(
    String(message || "")
  );
}

function requestContext(req, res, next) {
  const providedId = req.get("x-request-id");
  req.id =
    typeof providedId === "string" && REQUEST_ID_PATTERN.test(providedId)
      ? providedId
      : randomUUID();
  res.set("X-Request-ID", req.id);
  next();
}

// Several legacy handlers still build their own 500 responses. Keep those
// responses from exposing database/validation internals while they are migrated.
function sanitizeErrorResponses(req, res, next) {
  const sendJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode < 400) return sendJson(body);
    if (res.locals?.operationalHealthResponse === true) return sendJson(body);
    if (res.statusCode >= 500) {
      return sendJson({
        success: false,
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId: req.id,
      });
    }

    const safeBody = body && typeof body === "object" ? { ...body } : {};
    delete safeBody.error;
    delete safeBody.stack;
    if (looksLikeInternalMessage(safeBody.message)) {
      safeBody.message = "Request could not be processed";
    }
    safeBody.success = false;
    safeBody.code = safeBody.code || "REQUEST_FAILED";
    safeBody.requestId = req.id;
    return sendJson(safeBody);
  };

  next();
}

function notFound(req, _res, next) {
  next(new AppError(404, `Endpoint not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, _next) {
  const publicError = toPublicError(err);
  const { statusCode } = publicError;

  console.error({
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message: err.message,
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
  });

  res.status(statusCode).json({
    success: false,
    code: publicError.code,
    message: publicError.message,
    requestId: req.id,
  });
}

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = {
  AppError,
  asyncHandler,
  errorHandler,
  notFound,
  requestContext,
  sanitizeErrorResponses,
  toPublicError,
};
