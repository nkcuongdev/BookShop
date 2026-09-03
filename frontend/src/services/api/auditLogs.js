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

export const auditLogsAPI = {
  getAll: (params = {}) => request(`/admin/audit-logs${buildQuery(params)}`),

  // Actors and action/category vocabulary for the filter controls.
  getMeta: () => request(`/admin/audit-logs/meta`),

  // Streams CSV rather than JSON, so it goes through downloadFile, which
  // carries the session the same way `request` does.
  exportCsv: (params = {}) =>
    downloadFile(`/admin/audit-logs/export${buildQuery(params)}`),
};
