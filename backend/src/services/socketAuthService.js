const { getCookieValue } = require("../middleware/auth");
const {
  ACCESS_COOKIE,
  authenticateAccessToken,
} = require("./authService");

const SOCKET_AUTH_REVALIDATE_MS = 60_000;

function socketAuthError(socket, code) {
  if (socket.data?.authorizationClosed) return;
  socket.data = socket.data || {};
  socket.data.authorizationClosed = true;
  socket.emit("auth:error", { code });
  socket.disconnect(true);
}

function createSocketAuthMiddleware({ authenticate = authenticateAccessToken } = {}) {
  return async (socket, next) => {
    try {
      const token = getCookieValue(socket, ACCESS_COOKIE);
      if (!token) return next(new Error("Authentication required"));
      const { user, decoded } = await authenticate(token);
      socket.data = socket.data || {};
      socket.data.accessToken = token;
      socket.user = user;
      socket.auth = decoded;
      return next();
    } catch {
      return next(new Error("Authentication failed"));
    }
  };
}

function enforceSocketAuthorization(
  socket,
  {
    authenticate = authenticateAccessToken,
    revalidateMs = SOCKET_AUTH_REVALIDATE_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    now = () => Date.now(),
  } = {}
) {
  let validationPromise = null;
  let expiryTimer = null;
  let revalidationTimer = null;

  const validate = async () => {
    if (socket.data?.authorizationClosed) return false;
    if (!validationPromise) {
      validationPromise = (async () => {
        const { user, decoded } = await authenticate(socket.data.accessToken);
        const identityChanged =
          String(user._id) !== String(socket.user._id) ||
          String(decoded.sid) !== String(socket.auth.sid) ||
          user.role !== socket.user.role ||
          user.status !== "active";
        if (identityChanged) throw new Error("Socket authorization changed");
        socket.user = user;
        socket.auth = decoded;
        return true;
      })().finally(() => {
        validationPromise = null;
      });
    }
    return validationPromise;
  };

  const disconnectForValidationFailure = () => {
    const expired = Number(socket.auth?.exp || 0) * 1000 <= now();
    socketAuthError(
      socket,
      expired ? "ACCESS_TOKEN_EXPIRED" : "SESSION_REVOKED"
    );
  };

  const expiryDelay = Math.max(Number(socket.auth?.exp || 0) * 1000 - now(), 0);
  expiryTimer = setTimeoutFn(
    () => socketAuthError(socket, "ACCESS_TOKEN_EXPIRED"),
    expiryDelay
  );
  expiryTimer?.unref?.();

  if (revalidateMs > 0) {
    revalidationTimer = setIntervalFn(() => {
      validate().catch(disconnectForValidationFailure);
    }, revalidateMs);
    revalidationTimer?.unref?.();
  }

  socket.use((_packet, next) => {
    validate()
      .then(() => next())
      .catch(() => {
        disconnectForValidationFailure();
        next(new Error("Socket authentication expired"));
      });
  });

  socket.on("disconnect", () => {
    if (expiryTimer) clearTimeoutFn(expiryTimer);
    if (revalidationTimer) clearIntervalFn(revalidationTimer);
    expiryTimer = null;
    revalidationTimer = null;
  });

  return { validate };
}

module.exports = {
  SOCKET_AUTH_REVALIDATE_MS,
  createSocketAuthMiddleware,
  enforceSocketAuthorization,
};
