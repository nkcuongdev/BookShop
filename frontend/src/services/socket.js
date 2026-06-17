import { io } from "socket.io-client";
import { API_BASE } from "./api/client";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  const token = localStorage.getItem("bookshop_token");
  const base = API_BASE.replace(/\/api\/?$/, "");
  socket = io(base, {
    autoConnect: false,
    auth: { token },
    withCredentials: true,
  });
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  s.auth = { token: localStorage.getItem("bookshop_token") };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
