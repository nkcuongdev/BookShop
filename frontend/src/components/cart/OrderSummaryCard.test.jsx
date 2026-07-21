// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAvailable: vi.fn(),
  validate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  pointsContext: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  vouchersAPI: {
    getAvailable: mocks.getAvailable,
    validate: mocks.validate,
  },
}));

vi.mock("@/features/loyalty/hooks", () => ({
  usePointsCheckoutContext: (...args) => mocks.pointsContext(...args),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }) => <section>{children}</section>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogHeader: ({ children }) => <header>{children}</header>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import OrderSummaryCard from "./OrderSummaryCard.jsx";

beforeEach(() => {
  // No points by default, matching a signed-out or point-less customer. Tests
  // that care about points override this.
  mocks.pointsContext.mockReturnValue({ data: null });
  mocks.getAvailable.mockResolvedValue({
    data: {
      vouchers: [
        {
          code: "PUBLIC50",
          type: "fixed",
          scope: "order",
          value: 50_000,
          minOrder: 100_000,
          maxDiscount: 0,
          endAt: "2026-08-01T17:00:00.000Z",
          description: "Public voucher",
          discountAmount: 50_000,
        },
      ],
    },
  });
  mocks.validate.mockResolvedValue({
    data: {
      discountAmount: 50_000,
      voucher: {
        code: "PUBLIC50",
        type: "fixed",
        scope: "order",
        value: 50_000,
      },
    },
  });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe("OrderSummaryCard voucher picker", () => {
  it("loads applicable vouchers and validates the selected code before applying", async () => {
    const onCouponChange = vi.fn();
    render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        showCheckoutButton={false}
        onCouponChange={onCouponChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Chọn voucher" }));

    expect(await screen.findByText("PUBLIC50")).toBeTruthy();
    expect(mocks.getAvailable).toHaveBeenCalledWith(300_000, undefined);

    fireEvent.click(
      screen.getByRole("button", { name: "Áp dụng PUBLIC50" })
    );

    await waitFor(() =>
      expect(mocks.validate).toHaveBeenCalledWith(
        "PUBLIC50",
        300_000,
        undefined
      )
    );
    await waitFor(() =>
      expect(onCouponChange).toHaveBeenLastCalledWith({
        orderVoucherCode: "PUBLIC50",
        shippingVoucherCode: "",
      })
    );
    expect(screen.getByText(/Đơn hàng.*PUBLIC50/)).toBeTruthy();
    expect(mocks.success).toHaveBeenCalledWith(
      "Áp dụng mã PUBLIC50 thành công"
    );
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("bookshop_applied_voucher")).toBe(
      "PUBLIC50"
    );
  });

  it("keeps one order voucher and one shipping voucher at the same time", async () => {
    mocks.validate.mockImplementation(async (code) => ({
      data: {
        discountAmount: code === "SHIP25" ? 25_000 : 10_000,
        voucher: {
          code,
          type: "fixed",
          scope: code === "SHIP25" ? "shipping" : "order",
          value: code === "SHIP25" ? 25_000 : 10_000,
        },
      },
    }));
    const onCouponChange = vi.fn();
    render(
      <OrderSummaryCard
        subtotal={300_000}
        shippingFee={25_000}
        itemCount={2}
        showCheckoutButton={false}
        onCouponChange={onCouponChange}
      />
    );

    const input = screen.getByPlaceholderText("Mã giảm giá");
    fireEvent.change(input, { target: { value: "ORDER10" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(screen.getByText(/Đơn hàng.*ORDER10/)).toBeTruthy());

    fireEvent.change(input, { target: { value: "SHIP25" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));

    await waitFor(() =>
      expect(onCouponChange).toHaveBeenLastCalledWith({
        orderVoucherCode: "ORDER10",
        shippingVoucherCode: "SHIP25",
      })
    );
    expect(screen.getByText(/Phí ship.*SHIP25/)).toBeTruthy();
    expect(window.sessionStorage.getItem("bookshop_applied_voucher")).toBe(
      "ORDER10"
    );
    expect(
      window.sessionStorage.getItem("bookshop_applied_shipping_voucher")
    ).toBe("SHIP25");
  });

  it("stores a shipping voucher while waiting for an address", async () => {
    mocks.validate.mockResolvedValue({
      data: {
        discountAmount: 0,
        voucher: {
          code: "SHIP_LATER",
          type: "fixed",
          scope: "shipping",
          value: 25_000,
        },
      },
    });
    const onCouponChange = vi.fn();
    render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        showCheckoutButton={false}
        onCouponChange={onCouponChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Mã giảm giá"), {
      target: { value: "SHIP_LATER" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));

    await waitFor(() =>
      expect(onCouponChange).toHaveBeenLastCalledWith({
        orderVoucherCode: "",
        shippingVoucherCode: "SHIP_LATER",
      })
    );
    expect(screen.getByText(/Phí ship.*SHIP_LATER.*chờ địa chỉ/)).toBeTruthy();
    expect(screen.getByText("Tính khi nhập địa chỉ")).toBeTruthy();
    expect(mocks.validate).toHaveBeenCalledWith(
      "SHIP_LATER",
      300_000,
      undefined
    );
  });
});

describe("OrderSummaryCard - loyalty points", () => {
  const PROGRAM = {
    enabled: true,
    redeemEnabled: true,
    redeemRate: 1000,
    redeemMinPoints: 10,
    redeemMaxPercent: 30,
    redeemStep: 10,
  };

  function withPoints(balance = 500) {
    mocks.pointsContext.mockReturnValue({
      data: { balance, program: PROGRAM },
    });
  }

  it("is absent unless showPoints is set, leaving the cart total untouched", () => {
    withPoints();
    render(
      <OrderSummaryCard subtotal={300_000} itemCount={2} shippingFee={0} />
    );

    expect(screen.queryByText("Dùng điểm thưởng")).toBeNull();
    // Subtotal and total both read 300.000đ, which is what an undiscounted
    // basket looks like: no points row came between them.
    expect(screen.getAllByText("300.000đ")).toHaveLength(2);
    expect(screen.queryByText(/Điểm thưởng \(/)).toBeNull();
  });

  it("applies points and reduces the total", async () => {
    withPoints();
    render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        shippingFee={0}
        showPoints
      />
    );

    // 30% of 300.000 = 90.000đ = 90 points.
    fireEvent.click(screen.getByRole("button", { name: /Dùng tối đa 90 điểm/ }));

    await waitFor(() =>
      expect(screen.getByText(/Điểm thưởng \(90 điểm\)/)).toBeTruthy()
    );
    // 300.000 - 90.000
    expect(screen.getByText("210.000đ")).toBeTruthy();
  });

  it("reports the applied points to the parent", async () => {
    withPoints();
    const onSummaryChange = vi.fn();
    render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        shippingFee={0}
        showPoints
        onSummaryChange={onSummaryChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Dùng tối đa/ }));

    await waitFor(() =>
      expect(onSummaryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ appliedPoints: 90, pointsDiscount: 90_000 })
      )
    );
  });

  it("clamps to the balance and says so", async () => {
    withPoints(40);
    render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        shippingFee={0}
        showPoints
      />
    );

    fireEvent.change(screen.getByLabelText("Số điểm muốn dùng"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng điểm thưởng" }));

    await waitFor(() =>
      expect(screen.getByText(/Chỉ áp dụng được 40 điểm/)).toBeTruthy()
    );
    // Clamped to the 40 points actually held, not the 500 requested.
    expect(screen.getByText(/Đang dùng 40 điểm/)).toBeTruthy();
    expect(screen.getByText("260.000đ")).toBeTruthy();
  });

  it("keeps the customer's intent when the ceiling narrows, and restores it when it widens", async () => {
    withPoints();
    const { rerender } = render(
      <OrderSummaryCard
        subtotal={1_000_000}
        itemCount={2}
        shippingFee={0}
        showPoints
      />
    );

    // 30% of 1.000.000 = 300 points, but the balance caps it at 300 too.
    fireEvent.change(screen.getByLabelText("Số điểm muốn dùng"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng điểm thưởng" }));
    await waitFor(() =>
      expect(screen.getByText(/Đang dùng 300 điểm/)).toBeTruthy()
    );

    // The basket shrinks: the ceiling drops to 30% of 200.000 = 60 points.
    rerender(
      <OrderSummaryCard
        subtotal={200_000}
        itemCount={1}
        shippingFee={0}
        showPoints
      />
    );
    await waitFor(() =>
      expect(screen.getByText(/Đang dùng 60 điểm/)).toBeTruthy()
    );
    expect(screen.getByText(/Chỉ áp dụng được 60 điểm/)).toBeTruthy();

    // The basket grows back: the original intent returns without retyping.
    // This is what a clamp written into state would have destroyed.
    rerender(
      <OrderSummaryCard
        subtotal={1_000_000}
        itemCount={2}
        shippingFee={0}
        showPoints
      />
    );
    await waitFor(() =>
      expect(screen.getByText(/Đang dùng 300 điểm/)).toBeTruthy()
    );
    expect(screen.queryByText(/Chỉ áp dụng được/)).toBeNull();
  });

  it("does not count shipping toward the points ceiling", async () => {
    withPoints();
    const { rerender } = render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        shippingFee={0}
        showPoints
      />
    );
    expect(
      screen.getByRole("button", { name: /Dùng tối đa 90 điểm/ })
    ).toBeTruthy();

    rerender(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        shippingFee={50_000}
        showPoints
      />
    );
    // Still 90: a pricier delivery does not buy a bigger points allowance.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Dùng tối đa 90 điểm/ })
      ).toBeTruthy()
    );
  });

  it("offers nothing when the customer has no points", () => {
    withPoints(0);
    render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        shippingFee={0}
        showPoints
      />
    );
    expect(screen.queryByText("Dùng điểm thưởng")).toBeNull();
  });

  it("offers nothing while redeeming is switched off", () => {
    mocks.pointsContext.mockReturnValue({
      data: { balance: 500, program: { ...PROGRAM, redeemEnabled: false } },
    });
    render(
      <OrderSummaryCard
        subtotal={300_000}
        itemCount={2}
        shippingFee={0}
        showPoints
      />
    );
    expect(screen.queryByText("Dùng điểm thưởng")).toBeNull();
  });
});
