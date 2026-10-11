// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ permissions: { value: [] } }));

vi.mock("@/context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { id: "agent-1", role: "support", permissions: mocks.permissions.value } }),
}));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => async () => true }));
vi.mock("@/services/api", () => ({
  supportTicketsAPI: {
    getShippingProviders: async () => ({
      data: { providers: [{ id: "ghn", name: "GHN", enabled: true, description: "GHN Sandbox" }] },
    }),
  },
}));

import OrderResolutionPanel from "./OrderResolutionPanel.jsx";

const ticket = {
  _id: "ticket-1",
  category: "OTHER",
  resolution: null,
  requestDetails: { items: [] },
  order: {
    _id: "order-1",
    status: "PROCESSING",
    payment: { method: "COD", status: "UNPAID" },
    items: [],
  },
};

// The plan choices live in the dialog opened from the panel summary.
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <OrderResolutionPanel ticket={ticket} onChanged={() => {}} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /Tạo phương án/ }));
  return view;
}

afterEach(() => cleanup());

describe("OrderResolutionPanel (R-B1)", () => {
  it("does not preselect or allow CREATE_SHIPMENT without order.fulfill", async () => {
    mocks.permissions.value = ["ticket.read", "ticket.resolve", "order.support"];
    renderPanel();
    await waitFor(() => screen.getByRole("button", { name: /Tạo vận đơn/ }));

    const shipment = screen.getByRole("button", { name: /Tạo vận đơn/ });
    expect(shipment.getAttribute("aria-pressed")).toBe("false");
    expect(shipment.disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Hướng dẫn/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("still preselects CREATE_SHIPMENT for warehouse staff", async () => {
    mocks.permissions.value = ["ticket.read", "ticket.resolve", "order.fulfill"];
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Tạo vận đơn/ }).getAttribute("aria-pressed")).toBe("true")
    );
  });
});

describe("OrderResolutionPanel for the warehouse (R-C3)", () => {
  const reshipTicket = (status) => ({
    ...ticket,
    resolution: {
      type: "LOST_IN_TRANSIT_RESHIP",
      status,
      items: [{ book: "book-1", title: "Sách A", quantity: 1 }],
      shipment: { carrier: "GHN Express", trackingNumber: "GHN-1" },
    },
    order: { ...ticket.order, status: "SHIPPED" },
  });

  function renderReship(status, canResolve) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <OrderResolutionPanel ticket={reshipTicket(status)} onChanged={() => {}} canResolve={canResolve} />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Xem và quản lý/ }));
  }

  it("lets the warehouse hand over a reship but hides support decisions", async () => {
    mocks.permissions.value = ["ticket.read", "order.fulfill"];
    renderReship("PREPARING", false);
    expect(await screen.findByRole("button", { name: /Tạo vận đơn và bàn giao/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Hủy phiếu/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Chọn phương án khác/ })).toBeNull();
  });

  it("lets the warehouse confirm a shipped reship", async () => {
    mocks.permissions.value = ["ticket.read", "order.fulfill"];
    renderReship("SHIPPED", false);
    const deliver = await screen.findByRole("button", { name: /Xác nhận đã giao/ });
    expect(deliver.disabled).toBe(false);
  });

  it("keeps cancelling the reship for support", async () => {
    mocks.permissions.value = ["ticket.read", "ticket.resolve", "order.support"];
    renderReship("PREPARING", true);
    expect(await screen.findByRole("button", { name: /Hủy phiếu/ })).toBeTruthy();
  });
});
