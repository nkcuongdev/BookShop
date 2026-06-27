const {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  authenticateAccessToken,
  timingSafeEqual,
} = require("../services/authService");

const roleRegistry = require("../services/roleRegistry");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getCookieValue(reqOrSocket, name) {
  const headers = reqOrSocket.headers || reqOrSocket.handshake?.headers || {};
  const cookieHeader = headers.cookie || "";
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const prefix = `${name}=`;
  const match = parts.find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function getAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return { token: authHeader.slice(7).trim(), source: "bearer" };
  }
  const cookieToken = getCookieValue(req, ACCESS_COOKIE);
  return cookieToken
    ? { token: cookieToken, source: "cookie" }
    : { token: "", source: "none" };
}

function validateCsrf(req, expectedCsrf) {
  if (SAFE_METHODS.has(req.method)) return true;
  const header = req.get("x-csrf-token");
  const cookie = getCookieValue(req, CSRF_COOKIE);
  return (
    Boolean(header && cookie && expectedCsrf) &&
    timingSafeEqual(header, cookie) &&
    timingSafeEqual(header, expectedCsrf)
  );
}

async function authenticateRequest(req) {
  const { token, source } = getAuthToken(req);
  if (!token) throw new Error("Authentication required");
  const result = await authenticateAccessToken(token);
  if (source === "cookie" && !validateCsrf(req, result.decoded.csrf)) {
    const error = new Error("Invalid CSRF token");
    error.code = "INVALID_CSRF";
    throw error;
  }
  return { ...result, source };
}

const auth = async (req, res, next) => {
  try {
    const { user, decoded, source } = await authenticateRequest(req);
    req.user = user;
    req.auth = { ...decoded, source };
    return next();
  } catch (error) {
    const status = error.code === "INVALID_CSRF" ? 403 : 401;
    return res.status(status).json({
      success: false,
      message:
        status === 403
          ? "Yêu cầu bảo mật không hợp lệ"
          : "Phiên đăng nhập hết hạn hoặc không hợp lệ",
    });
  }
};

const forbidden = (res) =>
  res.status(403).json({
    success: false,
    code: "FORBIDDEN",
    message: "Ban khong co quyen thuc hien thao tac nay",
  });

const unauthenticated = (res) =>
  res.status(401).json({
    success: false,
    message: "Phien dang nhap het han hoac khong hop le",
  });

/**
 * These gates read the role table, which lives in the database, so they are
 * async. The registry answers from an in-memory cache, so the common path adds
 * no query. Any failure resolving permissions denies the request — never the
 * other way round.
 */
const guard = (decide) => async (req, res, next) => {
  if (!req.user) return unauthenticated(res);
  try {
    return (await decide(req)) ? next() : forbidden(res);
  } catch {
    return forbidden(res);
  }
};

/** Requires ALL of the listed permissions. Must run after `auth`. */
const requirePermission = (...permissions) =>
  guard(async (req) => {
    const results = await Promise.all(
      permissions.map((permission) =>
        roleRegistry.roleHasPermission(req.user.role, permission)
      )
    );
    return results.every(Boolean);
  });

/** Requires AT LEAST ONE of the listed permissions. Must run after `auth`. */
const requireAnyPermission = (...permissions) =>
  guard(async (req) => {
    const results = await Promise.all(
      permissions.map((permission) =>
        roleRegistry.roleHasPermission(req.user.role, permission)
      )
    );
    return results.some(Boolean);
  });

/**
 * Gate for routers that mix several staff concerns: it only asserts the caller
 * is shop staff, and each route adds its own requirePermission.
 */
const staffOnly = guard((req) => roleRegistry.isStaffRole(req.user.role));

const optionalAuth = async (req, res, next) => {
  const { token, source } = getAuthToken(req);
  if (!token) return next();
  try {
    const { user, decoded } = await authenticateAccessToken(token);
    if (source === "cookie" && !validateCsrf(req, decoded.csrf)) {
      return res.status(403).json({
        success: false,
        message: "Yêu cầu bảo mật không hợp lệ",
      });
    }
    req.user = user;
    req.auth = { ...decoded, source };
  } catch {
    // Invalid optional tokens are treated as anonymous on safe requests.
  }
  return next();
};

module.exports = {
  auth,
  authenticateRequest,
  getAuthToken,
  getCookieValue,
  optionalAuth,
  requireAnyPermission,
  requirePermission,
  staffOnly,
  validateCsrf,
};
