// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CART_BOOK = {
  _id: "book-cart",
  title: "Sách trong giỏ",
  price: 100000,
  stock: 10,
};
const BUY_NOW_BOOK = {
  _id: "book-buynow",
  title: "Sách mua ngay",
  price: 250000,
  stock: 10,
};

const mocks = vi.hoisted(() => ({
  authState: {
    user: { id: "user-1", name: "Reader", emailVerified: true },
    loading: false,
  },
  cartState: {
    items: [],
    totalPrice: 0,
    removePurchasedItems: vi.fn(),
    loading: false,
  },
  getAddresses: vi.fn(),
  getShippingQuotes: vi.fn(),
  createOrder: vi.fn(),
}));

vi.mock("@/context/AuthContext.jsx", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/context/CartContext.jsx", () => ({ useCart: () => mocks.cartState }));

vi.mock("@/features/loyalty/hooks", () => ({
  usePointsCheckoutContext: () => ({ data: null }),
}));

vi.mock("@/services/api", () => ({
  authAPI: {
    getAddresses: mocks.getAddresses,
    requestEmailVerification: vi.fn(),
  },
  eventsAPI: {
    getSessionId: vi.fn(() => "session-1"),
    track: vi.fn(() => Promise.resolve()),
  },
  ordersAPI: {
    create: mocks.createOrder,
    getShippingQuotes: mocks.getShippingQuotes,
  },
  vouchersAPI: { validate: vi.fn() },
}));

import Checkout from "./Checkout.jsx";
import { saveBuyNowSelection } from "@/utils/buyNow";

function renderCheckout(state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/checkout", state }]}>
      <Routes>
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/cart" element={<div>cart-page</div>} />
        <Route path="/books/:id" element={<div>book-page</div>} />
        <Route path="/profile/orders/:id" element={<div>order-page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.authState.user = { id: "user-1", name: "Reader", emailVerified: true };
  mocks.authState.loading = false;
  mocks.cartState.items = [{ book: CART_BOOK, quantity: 2 }];
  mocks.cartState.totalPrice = 200000;
  mocks.cartState.loading = false;
  mocks.getAddresses.mockResolvedValue({
    data: {
      addresses: [
        {
          _id: "addr-1",
          isDefault: true,
          fullName: "Nguyen Van A",
          phone: "0912345678",
          address: "12 Nguyen Trai",
          city: "Hà Nội",
          district: "Thanh Xuân",
          ward: "Khương Trung",
        },
      ],
    },
  });
  mocks.getShippingQuotes.mockResolvedValue({
    data: { options: [{ id: "ghn-standard", method: "standard", title: "Giao tiêu chuẩn", fee: 20000 }] },
  });
  mocks.createOrder.mockResolvedValue({
    success: true,
    data: { order: { _id: "order-1", items: [] } },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Checkout buy-now mode", () => {
  it("shows only the buy-now book, not the items already in the cart", async () => {
    renderCheckout({ buyNow: { book: BUY_NOW_BOOK, quantity: 1 } });

    expect(await screen.findAllByText("Sách mua ngay")).toBeTruthy();
    expect(screen.queryByText("Sách trong giỏ")).toBeNull();
  });

  it("prices the order from the buy-now book alone", async () => {
    renderCheckout({ buyNow: { book: BUY_NOW_BOOK, quantity: 2 } });

    // 250.000 x 2, and nothing from the 200.000 sitting in the cart.
    await waitFor(() =>
      expect(screen.getAllByText(/500\.000/).length).toBeGreaterThan(0)
    );
    expect(screen.queryByText(/700\.000/)).toBeNull();
  });

  it("falls back to sessionStorage when a reload drops the router state", async () => {
    saveBuyNowSelection(BUY_NOW_BOOK, 1);
    renderCheckout(undefined);

    expect(await screen.findAllByText("Sách mua ngay")).toBeTruthy();
    expect(screen.queryByText("Sách trong giỏ")).toBeNull();
  });

  it("still uses the cart when there is no buy-now selection", async () => {
    renderCheckout(undefined);

    expect(await screen.findByText("Sách trong giỏ")).toBeTruthy();
    expect(screen.queryAllByText("Sách mua ngay")).toHaveLength(0);
  });

  it("redirects to the cart when the cart is empty and there is no buy-now selection", async () => {
    mocks.cartState.items = [];
    mocks.cartState.totalPrice = 0;
    renderCheckout(undefined);

    await waitFor(() => expect(screen.getByText("cart-page")).toBeTruthy());
  });

  it("checks out a buy-now book even when the cart is empty", async () => {
    mocks.cartState.items = [];
    mocks.cartState.totalPrice = 0;
    renderCheckout({ buyNow: { book: BUY_NOW_BOOK, quantity: 1 } });

    expect(await screen.findAllByText("Sách mua ngay")).toBeTruthy();
    expect(screen.queryByText("cart-page")).toBeNull();
  });

  it("quotes shipping for the buy-now item only, not the whole cart", async () => {
    renderCheckout({ buyNow: { book: BUY_NOW_BOOK, quantity: 3 } });

    // The saved default address satisfies step 1, so "Tiếp tục" reaches the
    // shipping step where the item payload is built.
    await screen.findAllByText("Sách mua ngay");
    await waitFor(() => expect(mocks.getAddresses).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: /Tiếp tục/i })[0]);

    await waitFor(() => expect(mocks.getShippingQuotes).toHaveBeenCalled());
    expect(mocks.getShippingQuotes.mock.calls[0][0].items).toEqual([
      { bookId: "book-buynow", quantity: 3 },
    ]);
  });
});
