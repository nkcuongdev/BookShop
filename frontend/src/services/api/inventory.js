import { downloadFile, request } from "./client";

function buildQuery(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    )
  );
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : "";
}

export const inventoryAPI = {
  getLedger: (params = {}) =>
    request(`/admin/inventory/ledger${buildQuery(params)}`),

  getBookLedger: (bookId, params = {}) =>
    request(`/admin/inventory/books/${bookId}/ledger${buildQuery(params)}`),

  adjust: (data) =>
    request(`/admin/inventory/adjust`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getLowStock: (params = {}) =>
    request(`/admin/inventory/low-stock${buildQuery(params)}`),

  getValuation: () => request(`/admin/inventory/valuation`),

  getReport: (params = {}) =>
    request(`/admin/inventory/report${buildQuery(params)}`),

  getReconcile: (params = {}) =>
    request(`/admin/inventory/reconcile${buildQuery(params)}`),
};

export const stockReceiptsAPI = {
  getAll: (params = {}) =>
    request(`/admin/stock-receipts${buildQuery(params)}`),

  getById: (id) => request(`/admin/stock-receipts/${id}`),

  create: (data) =>
    request(`/admin/stock-receipts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/admin/stock-receipts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  confirm: (id) =>
    request(`/admin/stock-receipts/${id}/confirm`, { method: "POST" }),

  cancel: (id, reason) =>
    request(`/admin/stock-receipts/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

export const stockIssuesAPI = {
  getAll: (params = {}) => request(`/admin/stock-issues${buildQuery(params)}`),

  getById: (id) => request(`/admin/stock-issues/${id}`),

  create: (data) =>
    request(`/admin/stock-issues`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/admin/stock-issues/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  confirm: (id) =>
    request(`/admin/stock-issues/${id}/confirm`, { method: "POST" }),

  cancel: (id, reason) =>
    request(`/admin/stock-issues/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

export const stockCountsAPI = {
  getAll: (params = {}) => request(`/admin/stock-counts${buildQuery(params)}`),

  getById: (id) => request(`/admin/stock-counts/${id}`),

  create: (data) =>
    request(`/admin/stock-counts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  saveItems: (id, items) =>
    request(`/admin/stock-counts/${id}/items`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),

  complete: (id) =>
    request(`/admin/stock-counts/${id}/complete`, { method: "POST" }),

  cancel: (id, reason) =>
    request(`/admin/stock-counts/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // The export endpoint streams CSV rather than JSON, so it goes through
  // downloadFile, which carries the session the same way `request` does.
  exportCsv: (id) => downloadFile(`/admin/stock-counts/${id}/export`),
};
