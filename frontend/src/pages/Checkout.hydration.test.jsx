// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authState: { user: { id: "user-1", name: "Reader" }, loading: false },
  cartState: {
    items: [],
    totalPrice: 0,
    removePurchasedItems: vi.fn(),
    loading: true,
  },
  getAddresses: vi.fn(),
}));

vi.mock("@/context/AuthContext.jsx", () => ({
  useAuth: () => mocks.authState,
}));

vi.mock("@/context/CartContext.jsx", () => ({
  useCart: () => mocks.cartState,
}));

vi.mock("@/features/loyalty/hooks", () => ({
  usePointsCheckoutContext: () => ({ data: null }),
}));

vi.mock("@/services/api", () => ({
  authAPI: { getAddresses: mocks.getAddresses },
  eventsAPI: {
    getSessionId: vi.fn(() => "session-1"),
    track: vi.fn(() => Promise.resolve()),
  },
  ordersAPI: { create: vi.fn() },
}));

import Checkout from "./Checkout.jsx";

function CheckoutRoutes() {
  return (
    <MemoryRouter initialEntries={["/checkout"]}>
      <Routes>
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/cart" element={<div>cart-page</div>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.authState.user = { id: "user-1", name: "Reader" };
  mocks.authState.loading = false;
  mocks.cartState.items = [];
  mocks.cartState.totalPrice = 0;
  mocks.cartState.loading = true;
  mocks.getAddresses.mockResolvedValue({ data: { addresses: [] } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Checkout hydration guard", () => {
  it("does not redirect an empty-looking cart before server hydration finishes", async () => {
    const view = render(<CheckoutRoutes />);

    expect(screen.getByRole("status").textContent).toContain(
      "Đang chuẩn bị thanh toán"
    );
    expect(screen.queryByText("cart-page")).toBeNull();

    mocks.cartState.loading = false;
    view.rerender(<CheckoutRoutes />);

    await waitFor(() => expect(screen.getByText("cart-page")).toBeTruthy());
  });
});
