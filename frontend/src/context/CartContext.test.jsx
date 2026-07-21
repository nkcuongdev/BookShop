// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authState: { user: null, loading: true },
  getCart: vi.fn(),
  mergeCart: vi.fn(),
}));

vi.mock("@/context/AuthContext.jsx", () => ({
  useAuth: () => mocks.authState,
}));

vi.mock("@/services/api", () => ({
  cartAPI: {
    get: mocks.getCart,
    merge: mocks.mergeCart,
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    clear: vi.fn(),
  },
}));

import { CartProvider, useCart } from "./CartContext.jsx";

function CartProbe() {
  const { items, loading, totalItems, addItem } = useCart();
  return (
    <>
      <div
        data-testid="cart-state"
        data-loading={String(loading)}
        data-lines={String(items.length)}
      >
        {totalItems}
      </div>
      <button
        type="button"
        onClick={() =>
          addItem(
            {
              _id: "book-large-stock",
              title: "Large Stock",
              price: 100,
              stock: 500,
            },
            150
          )
        }
      >
        add-many
      </button>
    </>
  );
}

beforeEach(() => {
  const values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  });
  mocks.authState.user = null;
  mocks.authState.loading = true;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CartProvider hydration", () => {
  it("waits for authenticated server cart hydration before becoming ready", async () => {
    let resolveCart;
    mocks.getCart.mockReturnValue(
      new Promise((resolve) => {
        resolveCart = resolve;
      })
    );

    const view = render(
      <CartProvider>
        <CartProbe />
      </CartProvider>
    );

    expect(screen.getByTestId("cart-state").dataset.loading).toBe("true");
    expect(mocks.getCart).not.toHaveBeenCalled();

    mocks.authState.user = { id: "user-1" };
    mocks.authState.loading = false;
    view.rerender(
      <CartProvider>
        <CartProbe />
      </CartProvider>
    );

    expect(screen.getByTestId("cart-state").dataset.loading).toBe("true");
    expect(mocks.getCart).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCart({
        success: true,
        data: {
          cart: {
            items: [
              {
                book: { _id: "book-1", title: "Book", price: 100, stock: 5 },
                quantity: 2,
              },
            ],
          },
        },
      });
    });

    const state = screen.getByTestId("cart-state");
    expect(state.dataset.loading).toBe("false");
    expect(state.dataset.lines).toBe("1");
    expect(state.textContent).toBe("2");

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("bookshop_cart_user_user-1")
      );
      expect(stored[0].bookId).toBe("book-1");
      expect(stored[0].book).toBeUndefined();
      expect(stored[0].snapshot).toEqual({
        title: "Book",
        author: "",
        imageUrl: "",
        price: 100,
        stock: 5,
        status: "active",
      });
    });
  });

  it("caps guest quantities at the checkout-compatible limit", async () => {
    mocks.authState.user = null;
    mocks.authState.loading = false;

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("cart-state").dataset.loading).toBe("false")
    );
    fireEvent.click(screen.getByRole("button", { name: "add-many" }));
    expect(screen.getByTestId("cart-state").textContent).toBe("99");
  });
});
