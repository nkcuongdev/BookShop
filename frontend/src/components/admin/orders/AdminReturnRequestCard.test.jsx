// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/components/ui/sonner", () => ({
  toast: { error: mocks.error },
}));

import AdminReturnRequestCard from "./AdminReturnRequestCard.jsx";

const request = {
  _id: "return-1",
  status: "PENDING",
  reason: "WRONG_ITEM",
  details: "Khách nhận được sản phẩm khác với đơn đặt.",
  images: ["https://images.example/wrong-item.webp"],
  createdAt: "2026-07-31T03:30:00.000Z",
  items: [
    {
      book: "507f1f77bcf86cd799439012",
      title: "Dế Mèn Phiêu Lưu Ký",
      unitPrice: 90_000,
      orderedQuantity: 2,
      quantity: 1,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminReturnRequestCard", () => {
  it("approves with optional instructions", () => {
    const onResolve = vi.fn();
    render(<AdminReturnRequestCard request={request} onResolve={onResolve} />);

    expect(screen.getByAltText("ảnh bằng chứng đổi trả 1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Phản hồi cho khách"), {
      target: { value: "Mang sách đến điểm tiếp nhận gần nhất." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Duyệt yêu cầu" }));

    expect(onResolve).toHaveBeenCalledWith(
      "APPROVED",
      "Mang sách đến điểm tiếp nhận gần nhất."
    );
  });

  it("requires a reason before rejection", () => {
    const onResolve = vi.fn();
    render(<AdminReturnRequestCard request={request} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
    expect(mocks.error).toHaveBeenCalledWith("Vui lòng nhập lý do từ chối");
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Phản hồi cho khách"), {
      target: { value: "Không đúng điều kiện đổi trả." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
    expect(onResolve).toHaveBeenCalledWith(
      "REJECTED",
      "Không đúng điều kiện đổi trả."
    );
  });
  // F32: receiving touches stock and money, so the goods condition is an
  // explicit choice and the summary must be confirmed.
  it("requires a goods condition and a confirmation before receiving", () => {
    const onResolve = vi.fn();
    render(
      <AdminReturnRequestCard
        request={{ ...request, status: "RETURNING", returnCode: "RT-1" }}
        onResolve={onResolve}
      />
    );

    const receive = screen.getByRole("button", { name: "Đã nhận hàng trả" });
    expect(receive.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Hư hỏng, không nhập kho"));
    fireEvent.click(screen.getByRole("button", { name: "Đã nhận hàng trả" }));
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText("Kiểm tra lại trước khi xác nhận")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đã nhận hàng" }));
    expect(onResolve).toHaveBeenCalledWith("RECEIVED", "", { restock: false });
  });

  it("confirms the amount and reference before closing a manual refund", () => {
    const onResolve = vi.fn();
    render(
      <AdminReturnRequestCard
        request={{
          ...request,
          status: "RECEIVED",
          refund: { status: "MANUAL_REQUIRED", amount: 90_000 },
        }}
        onResolve={onResolve}
      />
    );

    fireEvent.change(screen.getByLabelText("Mã giao dịch hoàn tiền"), {
      target: { value: "BANK-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tất yêu cầu" }));
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đã hoàn tiền" }));
    expect(onResolve).toHaveBeenCalledWith("CLOSED", "", { refundTransactionId: "BANK-001" });
  });
});
