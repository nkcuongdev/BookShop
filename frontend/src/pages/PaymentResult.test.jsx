// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getByCode: vi.fn(),
  getById: vi.fn(),
  refreshCart: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/api", () => ({
  ordersAPI: {
    getByCode: mocks.getByCode,
    getById: mocks.getById,
  },
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ refreshCart: mocks.refreshCart }),
}));

import PaymentResult from "./PaymentResult";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("PaymentResult", () => {
  it("does not call the API when the callback has no order identifier", () => {
    render(
      <MemoryRouter initialEntries={["/payment-result"]}>
        <PaymentResult />
      </MemoryRouter>
    );

    expect(screen.getByTestId("payment-result").dataset.status).toBe("invalid");
    expect(mocks.getById).not.toHaveBeenCalled();
    expect(mocks.getByCode).not.toHaveBeenCalled();
  });

  it("uses the server payment state and refreshes the authoritative cart", async () => {
    const orderId = "507f1f77bcf86cd799439011";
    const items = [{ book: { _id: "507f191e810c19729de860ea" }, quantity: 2 }];
    mocks.getById.mockResolvedValue({
      success: true,
      data: {
        order: {
          _id: orderId,
          orderCode: "OD-PAID-1",
          status: "PROCESSING",
          payment: { status: "PAID" },
          items,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={[`/payment-result?orderId=${orderId}`]}>
        <PaymentResult />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("payment-result").dataset.status).toBe("success");
    });
    expect(mocks.getById).toHaveBeenCalledWith(orderId);
    await waitFor(() => {
      expect(mocks.refreshCart).toHaveBeenCalledTimes(1);
    });
  });

  it("ends polling with an actionable unconfirmed state and supports manual retry", async () => {
    vi.useFakeTimers();
    const orderId = "507f1f77bcf86cd799439012";
    mocks.getById.mockResolvedValue({
      success: true,
      data: {
        order: {
          _id: orderId,
          orderCode: "OD-PENDING-1",
          status: "PENDING",
          payment: { status: "UNPAID" },
        },
      },
    });

    render(
      <MemoryRouter initialEntries={[`/payment-result?orderId=${orderId}`]}>
        <PaymentResult />
      </MemoryRouter>
    );
    await act(async () => {
      await Promise.resolve();
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId("payment-result").dataset.status).toBe(
      "unconfirmed"
    );
    expect(screen.getByRole("button", { name: "Kiểm tra lại" })).toBeTruthy();
    const callsBeforeRetry = mocks.getById.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra lại" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getById.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it("revalidates when the browser regains focus", async () => {
    const orderId = "507f1f77bcf86cd799439013";
    mocks.getById
      .mockResolvedValueOnce({
        success: true,
        data: {
          order: {
            _id: orderId,
            orderCode: "OD-FOCUS-1",
            status: "PENDING",
            payment: { status: "UNPAID" },
          },
        },
      })
      .mockResolvedValue({
        success: true,
        data: {
          order: {
            _id: orderId,
            orderCode: "OD-FOCUS-1",
            status: "PROCESSING",
            payment: { status: "PAID" },
          },
        },
      });

    render(
      <MemoryRouter initialEntries={[`/payment-result?orderId=${orderId}`]}>
        <PaymentResult />
      </MemoryRouter>
    );
    await waitFor(() => expect(mocks.getById).toHaveBeenCalledTimes(1));
    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByTestId("payment-result").dataset.status).toBe("success");
    });
  });
});
