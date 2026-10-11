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
