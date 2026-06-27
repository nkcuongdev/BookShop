const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../config");
const AuthSession = require("../models/AuthSession");
const User = require("../models/User");

const ACCESS_COOKIE = "bookshop_access";
const REFRESH_COOKIE = "bookshop_refresh";
const CSRF_COOKIE = "bookshop_csrf";
const LEGACY_COOKIE = "bookshop_token";
let socketServer = null;

function setSocketServer(io) {
  socketServer = io || null;
}

function disconnectSocketRoom(room, code = "SESSION_REVOKED") {
  if (!socketServer || !room) return;
  try {
    socketServer.to(room).emit("auth:error", { code });
    socketServer.in(room).disconnectSockets(true);
  } catch (error) {
    console.error("Unable to disconnect revoked socket room", {
      room,
      message: error.message,
    });
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function timingSafeEqual(actual, expected) {
  const a = Buffer.from(String(actual || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function signToken(user, { sid, csrf, type }) {
  const isRefresh = type === "refresh";
  return jwt.sign(
    {
      id: String(user._id),
      sid,
      csrf,
      ver: Number(user.tokenVersion || 0),
      type,
    },
    isRefresh ? config.jwtRefreshSecret : config.jwtSecret,
    {
      algorithm: "HS256",
      audience: config.jwtAudience,
      issuer: config.jwtIssuer,
      expiresIn: isRefresh
        ? config.jwtRefreshExpiresIn
        : config.jwtExpiresIn,
    }
  );
}

function verifyJwt(token, type) {
  const decoded = jwt.verify(
    token,
    type === "refresh" ? config.jwtRefreshSecret : config.jwtSecret,
    {
      algorithms: ["HS256"],
      audience: config.jwtAudience,
      issuer: config.jwtIssuer,
    }
  );
  if (decoded.type !== type || !decoded.id || !decoded.sid) {
    throw new Error("Invalid token type");
  }
  return decoded;
}

function tokenExpiry(token) {
  const decoded = jwt.decode(token);
  return new Date(Number(decoded.exp) * 1000);
}

function requestMetadata(req) {
  return {
    userAgent: String(req.get?.("user-agent") || "").slice(0, 500),
    ip: String(req.ip || req.socket?.remoteAddress || "").slice(0, 100),
  };
}

async function createSession(user, req) {
  const sid = crypto.randomUUID();
  const csrf = randomToken();
  const accessToken = signToken(user, { sid, csrf, type: "access" });
  const refreshToken = signToken(user, { sid, csrf, type: "refresh" });
  await AuthSession.create({
    user: user._id,
    sid,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: tokenExpiry(refreshToken),
    ...requestMetadata(req),
  });

  // Keep a bounded number of active sessions per account.
  const staleSessions = await AuthSession.find({
    user: user._id,
    revokedAt: null,
  })
    .sort({ createdAt: -1 })
    .skip(10)
    .select("_id");
  if (staleSessions.length) {
    await AuthSession.updateMany(
      { _id: { $in: staleSessions.map((session) => session._id) } },
      { $set: { revokedAt: new Date() } }
    );
  }

  return { accessToken, refreshToken, csrf, sid };
}

async function authenticateAccessToken(token) {
  const decoded = verifyJwt(token, "access");
  const [user, session] = await Promise.all([
    User.findById(decoded.id).select("+tokenVersion"),
    AuthSession.findOne({
      sid: decoded.sid,
      user: decoded.id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).select("_id"),
  ]);
  if (
    !user ||
    user.status === "banned" ||
    !session ||
    Number(decoded.ver) !== Number(user.tokenVersion || 0)
  ) {
    throw new Error("Session revoked");
  }
  return { user, decoded };
}

async function rotateSession(refreshToken, req) {
  const decoded = verifyJwt(refreshToken, "refresh");
  const user = await User.findById(decoded.id).select("+tokenVersion");
  if (
    !user ||
    user.status === "banned" ||
    Number(decoded.ver) !== Number(user.tokenVersion || 0)
  ) {
    throw new Error("Refresh session revoked");
  }

  const csrf = randomToken();
  const accessToken = signToken(user, {
    sid: decoded.sid,
    csrf,
    type: "access",
  });
  const nextRefreshToken = signToken(user, {
    sid: decoded.sid,
    csrf,
    type: "refresh",
  });
  const session = await AuthSession.findOneAndUpdate(
    {
      sid: decoded.sid,
      user: decoded.id,
      refreshTokenHash: hashToken(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        refreshTokenHash: hashToken(nextRefreshToken),
        expiresAt: tokenExpiry(nextRefreshToken),
        ...requestMetadata(req),
      },
    },
    { returnDocument: "after" }
  );
  if (!session) throw new Error("Refresh session revoked");
  return {
    user,
    accessToken,
    refreshToken: nextRefreshToken,
    csrf,
    sid: decoded.sid,
  };
}

function cookieBase() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    // Production serves the SPA and API from one origin, so authentication no
    // longer depends on browsers accepting third-party cookies.
    sameSite: "lax",
    secure: isProduction,
  };
}

function setSessionCookies(res, tokens) {
  const base = cookieBase();
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: Math.max(tokenExpiry(tokens.accessToken).getTime() - Date.now(), 0),
    path: "/",
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: Math.max(tokenExpiry(tokens.refreshToken).getTime() - Date.now(), 0),
    path: "/api/auth",
  });
  res.cookie(CSRF_COOKIE, tokens.csrf, {
    ...base,
    httpOnly: false,
    maxAge: Math.max(tokenExpiry(tokens.refreshToken).getTime() - Date.now(), 0),
    path: "/",
  });
  res.clearCookie(LEGACY_COOKIE, { ...base, httpOnly: true, path: "/" });
}

function clearSessionCookies(res) {
  const base = cookieBase();
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: "/" });
  res.clearCookie(REFRESH_COOKIE, {
    ...base,
    httpOnly: true,
    path: "/api/auth",
  });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, path: "/" });
  res.clearCookie(LEGACY_COOKIE, { ...base, httpOnly: true, path: "/" });
}

async function revokeSession(sid) {
  if (!sid) return;
  await AuthSession.updateOne(
    { sid, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  disconnectSocketRoom(`session:${sid}`);
}

async function revokeAllSessions(userId, { session = null, disconnect = true } = {}) {
  await AuthSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    session ? { session } : undefined
  );
  if (disconnect) disconnectSocketRoom(`user:${userId}`);
}

function disconnectUserSessions(userId) {
  disconnectSocketRoom(`user:${userId}`);
}

module.exports = {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  authenticateAccessToken,
  clearSessionCookies,
  createSession,
  disconnectUserSessions,
  hashToken,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  setSocketServer,
  setSessionCookies,
  timingSafeEqual,
  verifyJwt,
};
