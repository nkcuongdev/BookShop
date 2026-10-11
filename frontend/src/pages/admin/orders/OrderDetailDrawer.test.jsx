// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  permissions: { value: ["*"] },
}));

vi.mock("@/features/admin/orders/hooks", () => ({
  useOrderAction: () => ({
    mutate: mocks.mutate,
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
  useReturnRequestAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => async () => true }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/order/OrderReceipt", () => ({ default: () => null }));
vi.mock("@/components/admin/orders/AdminReturnRequestCard", () => ({ default: () => null }));
vi.mock("@/context/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: { id: "staff-1", role: "staff", permissions: mocks.permissions.value },
  }),
}));

import { OrderDetailDrawer } from "./OrderDetailDrawer.jsx";

function baseOrder(overrides = {}) {
  return {
    _id: "order-1",
    orderCode: "BK-0001",
    status: "SHIPPED",
    totalAmount: 200000,
    subtotal: 200000,
    items: [],
    history: [],
    trackingEvents: [],
    shippingAddress: { fullName: "Khách", phone: "0900000000", address: "1 Test" },
    payment: { method: "VNPAY", status: "PAID" },
    ...overrides,
  };
}

function renderDrawer(order) {
  return render(<OrderDetailDrawer order={order} open onOpenChange={() => {}} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutateAsync.mockResolvedValue({});
  mocks.permissions.value = ["*"];
});

afterEach(() => cleanup());

describe("confirm a cancellation done outside the system (R-C1)", () => {
  const parked = baseOrder({
    status: "CANCELLING",
    shipment: { provider: "ghn", providerOrderCode: "GHN-1" },
    cancellation: { status: "FAILED", attempts: 8, lastError: "GHN từ chối huỷ" },
  });

  it("asks for a reason, then finalizes without the carrier", async () => {
    mocks.permissions.value = ["admin.access", "order.read", "order.support"];
    renderDrawer(parked);

    fireEvent.click(screen.getByRole("button", { name: "Đã huỷ với GHN ngoài hệ thống" }));
    const confirmButton = await screen.findByRole("button", { name: "Chốt huỷ đơn" });
    expect(confirmButton.disabled).toBe(true);
    expect(screen.getByText("Cách đã huỷ với GHN (bắt buộc)")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Nhập lý do cụ thể..."), {
      target: { value: "Đã huỷ qua tổng đài GHN" },
    });
    expect(confirmButton.disabled).toBe(false);
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        id: "order-1",
        action: "confirmCancelledOutside",
        payload: { reason: "Đã huỷ qua tổng đài GHN" },
      })
    );
  });

  it("is not offered without order.support", () => {
    mocks.permissions.value = ["admin.access", "order.read", "order.fulfill"];
    renderDrawer(parked);
    expect(screen.queryByRole("button", { name: "Đã huỷ với GHN ngoài hệ thống" })).toBeNull();
  });
});
