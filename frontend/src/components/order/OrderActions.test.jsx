// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addItem: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("@/context/CartContext.jsx", () => ({
  useCart: () => ({ addItem: mocks.addItem }),
}));

import OrderActions from "./OrderActions.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OrderActions", () => {
  it.each(["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"])(
    "keeps support available when an order is %s",
    (status) => {
      const order = {
        _id: "507f1f77bcf86cd799439011",
        status,
        payment: { method: "COD", status: "UNPAID" },
        items: [],
      };

      render(<OrderActions order={order} />);
      fireEvent.click(screen.getByRole("button", { name: "Hỗ trợ & đổi trả" }));

      expect(mocks.navigate).toHaveBeenCalledWith(
        `/profile/support?orderId=${order._id}`
      );
    }
  );
});
