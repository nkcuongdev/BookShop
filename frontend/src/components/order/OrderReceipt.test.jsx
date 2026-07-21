// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderReceiptPrintButton from "./OrderReceipt.jsx";

const order = {
  _id: "507f1f77bcf86cd799439011",
  orderCode: "OD-RECEIPT-01",
  placedAt: "2026-07-26T03:30:00.000Z",
  status: "DELIVERED",
  shippingMethod: "express",
  shippingAddress: {
    fullName: "Nguyễn Văn An",
    phone: "0901234567",
    address: "12 Nguyễn Huệ",
    ward: "Phường Sài Gòn",
    district: "",
    city: "Thành phố Hồ Chí Minh",
  },
  items: [
    {
      book: "507f1f77bcf86cd799439012",
      title: "Dế Mèn Phiêu Lưu Ký",
      author: "Tô Hoài",
      price: 90_000,
      quantity: 2,
      subtotal: 180_000,
    },
  ],
  subtotal: 180_000,
  discountAmount: 20_000,
  shippingDiscountAmount: 5_000,
  shippingFee: 15_000,
  totalAmount: 175_000,
  voucher: { code: "BOOK20" },
  shippingVoucher: { code: "SHIP5" },
  payment: {
    method: "VNPAY",
    status: "PAID",
    transactionId: "TXN-123",
    paidAt: "2026-07-26T03:31:00.000Z",
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OrderReceiptPrintButton", () => {
  it("renders the immutable order snapshot in the printable receipt", () => {
    render(<OrderReceiptPrintButton order={order} />);

    const receipt = document.querySelector(".order-receipt");
    expect(receipt).toBeTruthy();
    const view = within(receipt);

    expect(view.getByText("BIÊN NHẬN ĐIỆN TỬ")).toBeTruthy();
    expect(view.getByText("OD-RECEIPT-01")).toBeTruthy();
    expect(view.getByText("Nguyễn Văn An")).toBeTruthy();
    expect(
      view.getByText("12 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh")
    ).toBeTruthy();
    expect(view.getByText("Dế Mèn Phiêu Lưu Ký")).toBeTruthy();
    expect(view.getByText("Giảm giá đơn hàng (BOOK20)")).toBeTruthy();
    expect(view.getByText("Giảm phí vận chuyển (SHIP5)")).toBeTruthy();
    expect(view.getByText("175.000đ")).toBeTruthy();
    expect(view.getByText("Mã GD: TXN-123")).toBeTruthy();
  });

  it("prints in an isolated frame without changing the page title", async () => {
    const originalTitle = document.title;
    render(<OrderReceiptPrintButton order={order} />);

    fireEvent.click(screen.getByRole("button", { name: "In / Lưu PDF" }));

    const frame = document.querySelector('iframe[title="Khung in biên nhận"]');
    expect(frame).toBeTruthy();
    const print = vi.fn();
    Object.defineProperties(frame.contentWindow, {
      focus: { configurable: true, value: vi.fn() },
      print: { configurable: true, value: print },
    });
    frame.dispatchEvent(new Event("load"));
    expect(frame.contentDocument.title).toBe("Bien-nhan-OD-RECEIPT-01");
    expect(frame.contentDocument.querySelector(".order-receipt")).toBeTruthy();
    expect(document.title).toBe(originalTitle);

    await vi.waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    frame.contentWindow.dispatchEvent(new Event("afterprint"));
    expect(document.body.contains(frame)).toBe(false);
    expect(document.title).toBe(originalTitle);
  });
});
