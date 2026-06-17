import { request } from "./client";

const SESSION_KEY = "bookshop_session_id";

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export const eventsAPI = {
  track: (payload) =>
    request("/events", {
      method: "POST",
      body: JSON.stringify({ sessionId: getSessionId(), ...payload }),
    }).catch(() => null),
  getSessionId,
};
