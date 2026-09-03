import { downloadFile, request } from "./client";

function buildQuery(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : "";
}

export const reportsAPI = {
  getProfit: (params = {}) =>
    request(`/admin/reports/profit${buildQuery(params)}`),

  // Streams as a file rather than JSON, so it goes through downloadFile, which
  // carries the session the same way `request` does.
  exportProfit: (params = {}) =>
    downloadFile(`/admin/reports/profit/export.csv${buildQuery(params)}`),
};
