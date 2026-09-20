import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock("./client", () => ({
  request: mocks.request,
  downloadFile: mocks.downloadFile,
}));

import { adminAPI } from "./admin.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin order report API", () => {
  it("omits empty filters from list and export query strings", async () => {
    mocks.request.mockResolvedValue({ data: {} });
    mocks.downloadFile.mockResolvedValue({ blob: new Blob(), filename: "orders.csv" });

    await adminAPI.getOrders({
      page: 1,
      status: undefined,
      paymentStatus: "PAID",
      dateFrom: "",
    });
    await adminAPI.exportOrders({
      status: undefined,
      paymentStatus: "PAID",
      dateFrom: "2026-08-01",
    });

    expect(mocks.request).toHaveBeenCalledWith(
      "/admin/orders?page=1&paymentStatus=PAID"
    );
    expect(mocks.downloadFile).toHaveBeenCalledWith(
      "/admin/orders/export.csv?paymentStatus=PAID&dateFrom=2026-08-01"
    );
  });
});
