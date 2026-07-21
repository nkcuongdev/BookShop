// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  useOrders: vi.fn(),
  exportOrders: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  permissions: { value: ["*"] },
}));

vi.mock("@/features/admin/orders/hooks", () => ({
  useOrders: (...args) => mocks.useOrders(...args),
  useOrder: () => ({ data: null }),
}));

vi.mock("@/services/api", () => ({
  adminAPI: { exportOrders: mocks.exportOrders },
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

vi.mock("@/components/admin/common/DataTable", () => ({
  DataTable: ({ toolbar }) => <div>{toolbar}</div>,
}));

vi.mock("./OrderDetailDrawer", () => ({
  OrderDetailDrawer: () => null,
}));

// The CSV button is gated on order.export, which now arrives on the session.
vi.mock("@/context/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: { id: "staff-1", role: "staff", permissions: mocks.permissions.value },
    loading: false,
  }),
}));

import OrdersList from "./OrdersList.jsx";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.value = ["*"];
  mocks.useOrders.mockReturnValue({
    data: {
      orders: [],
      statusCounts: { all: 0 },
      returnStatusCounts: {},
      pagination: { total: 0, totalPages: 1 },
    },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  mocks.exportOrders.mockResolvedValue({
    blob: new Blob(["csv"], { type: "text/csv" }),
    filename: "bookshop-orders.csv",
  });
  const NativeURL = globalThis.URL;
  class MockURL extends NativeURL {}
  MockURL.createObjectURL = vi.fn().mockReturnValue("blob:orders");
  MockURL.revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", MockURL);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OrdersList report filters", () => {
  it("uses payment and order-date filters for both list and CSV export", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/orders"]}>
        <OrdersList />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Lọc trạng thái thanh toán"), {
      target: { value: "PAID" },
    });
    fireEvent.change(screen.getByLabelText("Lọc phương thức thanh toán"), {
      target: { value: "VNPAY" },
    });
    fireEvent.change(screen.getByLabelText("Từ ngày đặt"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Đến ngày đặt"), {
      target: { value: "2026-08-11" },
    });

    await waitFor(() =>
      expect(mocks.useOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({
          paymentStatus: "PAID",
          paymentMethod: "VNPAY",
          dateFrom: "2026-08-01",
          dateTo: "2026-08-11",
          page: 1,
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Xuất CSV" }));

    await waitFor(() =>
      expect(mocks.exportOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: "PAID",
          paymentMethod: "VNPAY",
          dateFrom: "2026-08-01",
          dateTo: "2026-08-11",
        })
      )
    );
    expect(mocks.exportOrders.mock.calls[0][0]).not.toHaveProperty("page");
    expect(mocks.success).toHaveBeenCalledWith("Đã xuất báo cáo đơn hàng");
  });

  // Warehouse staff read orders to pick and pack them but hold no order.export,
  // so the CSV button must not be offered.
  it("hides the CSV export from staff without order.export", () => {
    mocks.permissions.value = ["admin.access", "order.read", "order.fulfill"];

    render(
      <MemoryRouter initialEntries={["/admin/orders"]}>
        <OrdersList />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: "Xuất CSV" })).toBeNull();
    expect(screen.getByLabelText("Lọc trạng thái thanh toán")).toBeTruthy();
  });
});
