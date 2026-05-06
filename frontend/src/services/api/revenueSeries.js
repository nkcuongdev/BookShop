import { request } from "./client";

export const revenueSeriesAPI = {
  getSeries: (days = 30) =>
    request(`/admin/analytics/revenue-series?days=${days}`),

  getCategoryShare: () => request(`/admin/analytics/category-share`),

  getActivity: () => request(`/admin/analytics/activity`),

  getFunnel: () => request(`/admin/analytics/funnel`),
};
