import { io } from "socket.io-client";
import {
  API_BASE,
  clearStoredSession,
  refreshSession,
} from "./api/client";

let socket = null;
let recoveryPromise = null;

function recoverSocketSession(refreshable) {
  if (!refreshable) {
    clearStoredSession();
    socket?.disconnect();
    return Promise.resolve();
  }
  if (!recoveryPromise) {
    recoveryPromise = refreshSession()
      .then(() => {
        if (!socket) return;
        if (socket.connected) socket.disconnect();
        socket.connect();
      })
      .catch(() => {
        clearStoredSession();
        socket?.disconnect();
      })
      .finally(() => {
        recoveryPromise = null;
      });
  }
  return recoveryPromise;
}

export function getSocket() {
  if (socket) return socket;
  const base = new URL(API_BASE, window.location.origin).origin;
  socket = io(base, {
    autoConnect: false,
    withCredentials: true,
  });
  socket.on("auth:error", ({ code } = {}) => {
    recoverSocketSession(code === "ACCESS_TOKEN_EXPIRED");
  });
  socket.on("connect_error", (error) => {
    if (/^Authentication (failed|required)$/.test(error?.message || "")) {
      recoverSocketSession(true);
    }
  });
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  s.auth = {};
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) socket.disconnect();
}
