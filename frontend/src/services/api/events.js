import { request } from "./client";

const SESSION_KEY = "bookshop_session_id";
const CLIENT_EVENT_TYPES = new Set([
  "product_view",
  "search",
  "add_to_cart",
  "cart_update",
  "checkout_start",
]);

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export const eventsAPI = {
  track: (payload = {}) => {
    if (!CLIENT_EVENT_TYPES.has(payload.type)) return Promise.resolve(null);
    const safePayload = {
      type: payload.type,
      bookId: payload.bookId,
      metadata: payload.metadata,
    };
    return request("/events", {
      method: "POST",
      body: JSON.stringify({ sessionId: getSessionId(), ...safePayload }),
    }).catch(() => null);
  },
  getSessionId,
};
