import { request } from "./client";

function buildQuery(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    )
  );
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : "";
}

export const loyaltyAPI = {
  // Customer
  getMe: () => request(`/loyalty/me`),

  getHistory: (params = {}) => request(`/loyalty/history${buildQuery(params)}`),

  previewRedeem: (subtotal, discountAmount = 0) =>
    request(`/loyalty/preview-redeem`, {
      method: "POST",
      body: JSON.stringify({ subtotal, discountAmount }),
    }),

  getGifts: (params = {}) => request(`/loyalty/gifts${buildQuery(params)}`),

  redeemGift: (giftId) =>
    request(`/loyalty/gifts/${giftId}/redeem`, { method: "POST" }),

  getMyGifts: (params = {}) => request(`/loyalty/my-gifts${buildQuery(params)}`),

  // Admin
  getProgram: () => request(`/admin/loyalty/program`),

  updateProgram: (data) =>
    request(`/admin/loyalty/program`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getMembers: (params = {}) =>
    request(`/admin/loyalty/members${buildQuery(params)}`),

  getMemberDetail: (userId, params = {}) =>
    request(`/admin/loyalty/members/${userId}${buildQuery(params)}`),

  adjustPoints: (userId, data) =>
    request(`/admin/loyalty/members/${userId}/adjust`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  recalcTier: (userId) =>
    request(`/admin/loyalty/members/${userId}/recalc-tier`, { method: "POST" }),

  getLedger: (params = {}) =>
    request(`/admin/loyalty/ledger${buildQuery(params)}`),

  getAdminGifts: (params = {}) =>
    request(`/admin/loyalty/gifts${buildQuery(params)}`),

  createGift: (data) =>
    request(`/admin/loyalty/gifts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateGift: (id, data) =>
    request(`/admin/loyalty/gifts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteGift: (id) =>
    request(`/admin/loyalty/gifts/${id}`, { method: "DELETE" }),

  getGiftRedemptions: (id, params = {}) =>
    request(`/admin/loyalty/gifts/${id}/redemptions${buildQuery(params)}`),

  getStats: (params = {}) => request(`/admin/loyalty/stats${buildQuery(params)}`),

  getReconcile: (params = {}) =>
    request(`/admin/loyalty/reconcile${buildQuery(params)}`),
};
