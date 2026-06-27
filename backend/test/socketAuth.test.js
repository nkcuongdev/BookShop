const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

const AuthSession = require("../src/models/AuthSession");
const {
  revokeAllSessions,
  revokeSession,
  setSocketServer,
} = require("../src/services/authService");
const {
  createSocketAuthMiddleware,
  enforceSocketAuthorization,
} = require("../src/services/socketAuthService");

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.data = {};
    this.handshake = { headers: {} };
    this.sent = [];
    this.disconnected = false;
  }

  emit(event, ...args) {
    this.sent.push([event, ...args]);
    return super.emit(event, ...args);
  }

  use(middleware) {
    this.packetMiddleware = middleware;
  }

  disconnect(force) {
    this.disconnected = true;
    this.forceDisconnect = force;
    super.emit("disconnect", "server namespace disconnect");
  }
}

function runHandshake(middleware, socket) {
  return new Promise((resolve) => middleware(socket, resolve));
}

test("socket handshake stores the authenticated token, user and session", async () => {
  const socket = new FakeSocket();
  socket.handshake.headers.cookie = "bookshop_access=signed-access-token";
  const user = { _id: "user-1", role: "admin", status: "active" };
  const decoded = { sid: "session-1", exp: 1234 };
  const middleware = createSocketAuthMiddleware({
    authenticate: async (token) => {
      assert.equal(token, "signed-access-token");
      return { user, decoded };
    },
  });

  assert.equal(await runHandshake(middleware, socket), undefined);
  assert.equal(socket.data.accessToken, "signed-access-token");
  assert.equal(socket.user, user);
  assert.equal(socket.auth, decoded);
});

test("socket authorization disconnects exactly at access-token expiry", () => {
  const socket = new FakeSocket();
  const currentTime = 1_000_000;
  socket.data.accessToken = "token";
  socket.user = { _id: "user-1", role: "user", status: "active" };
  socket.auth = { sid: "session-1", exp: currentTime / 1000 + 5 };
  let expiryCallback;
  let expiryDelay;
  let timeoutCleared = false;
  const timeoutHandle = { unref() {} };

  enforceSocketAuthorization(socket, {
    authenticate: async () => ({ user: socket.user, decoded: socket.auth }),
    revalidateMs: 0,
    now: () => currentTime,
    setTimeoutFn(callback, delay) {
      expiryCallback = callback;
      expiryDelay = delay;
      return timeoutHandle;
    },
    clearTimeoutFn(handle) {
      timeoutCleared = handle === timeoutHandle;
    },
  });

  assert.equal(expiryDelay, 5_000);
  expiryCallback();
  assert.equal(socket.disconnected, true);
  assert.equal(socket.forceDisconnect, true);
  assert.equal(timeoutCleared, true);
  assert.deepEqual(
    socket.sent.find(([event]) => event === "auth:error")?.[1],
    { code: "ACCESS_TOKEN_EXPIRED" }
  );
});

test("an incoming socket packet revalidates revocation and role changes", async () => {
  const socket = new FakeSocket();
  socket.data.accessToken = "token";
  socket.user = { _id: "user-1", role: "admin", status: "active" };
  socket.auth = { sid: "session-1", exp: 2_000 };

  enforceSocketAuthorization(socket, {
    authenticate: async () => ({
      user: { _id: "user-1", role: "user", status: "active" },
      decoded: socket.auth,
    }),
    revalidateMs: 0,
    now: () => 1_000_000,
    setTimeoutFn: () => ({ unref() {} }),
    clearTimeoutFn() {},
  });

  const packetError = await new Promise((resolve) => {
    socket.packetMiddleware(["chat:join", "conversation-1"], resolve);
  });
  assert.match(packetError.message, /authentication expired/i);
  assert.equal(socket.disconnected, true);
  assert.deepEqual(
    socket.sent.find(([event]) => event === "auth:error")?.[1],
    { code: "SESSION_REVOKED" }
  );
});

test("session revocation disconnects matching socket rooms", async () => {
  const originalUpdateOne = AuthSession.updateOne;
  const originalUpdateMany = AuthSession.updateMany;
  const emitted = [];
  const disconnected = [];
  AuthSession.updateOne = async () => ({ modifiedCount: 1 });
  AuthSession.updateMany = async () => ({ modifiedCount: 2 });
  setSocketServer({
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        },
      };
    },
    in(room) {
      return {
        disconnectSockets(force) {
          disconnected.push({ room, force });
        },
      };
    },
  });

  try {
    await revokeSession("session-1");
    await revokeAllSessions("user-1");
    assert.deepEqual(
      emitted.map(({ room }) => room),
      ["session:session-1", "user:user-1"]
    );
    assert.deepEqual(disconnected, [
      { room: "session:session-1", force: true },
      { room: "user:user-1", force: true },
    ]);
  } finally {
    AuthSession.updateOne = originalUpdateOne;
    AuthSession.updateMany = originalUpdateMany;
    setSocketServer(null);
  }
});
