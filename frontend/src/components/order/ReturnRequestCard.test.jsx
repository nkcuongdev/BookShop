// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createReturnRequest: vi.fn(),
  uploadReturnImage: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  ordersAPI: { createReturnRequest: mocks.createReturnRequest },
  uploadsAPI: { uploadReturnImage: mocks.uploadReturnImage },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }) => <section>{children}</section>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <footer>{children}</footer>,
  DialogHeader: ({ children }) => <header>{children}</header>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      {...props}
    />
  ),
}));

import ReturnRequestCard from "./ReturnRequestCard.jsx";

const order = {
  _id: "507f1f77bcf86cd799439011",
  status: "DELIVERED",
  returnEligibility: {
    eligible: true,
    code: "ELIGIBLE",
    deadline: "2026-08-07T03:30:00.000Z",
    windowDays: 7,
  },
  items: [
    {
      book: "507f1f77bcf86cd799439012",
      title: "Dế Mèn Phiêu Lưu Ký",
      price: 90_000,
      quantity: 2,
    },
  ],
};

beforeEach(() => {
  mocks.createReturnRequest.mockResolvedValue({ message: "Đã gửi yêu cầu đổi trả" });
  mocks.uploadReturnImage.mockResolvedValue({
    data: { image: { url: "https://images.example/return-evidence.webp" } },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReturnRequestCard", () => {
  it("submits selected products, quantity and reason", async () => {
    const onChanged = vi.fn();
    render(<ReturnRequestCard order={order} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Tạo yêu cầu đổi trả" }));
    const evidence = new File(["evidence"], "damaged-book.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Chọn ảnh bằng chứng"), {
      target: { files: [evidence] },
    });
    await waitFor(() =>
      expect(mocks.uploadReturnImage).toHaveBeenCalledWith(order._id, evidence)
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Dế Mèn Phiêu Lưu Ký/i })
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /Số lượng trả của Dế Mèn/i }),
      { target: { value: "2" } }
    );
    fireEvent.change(screen.getByLabelText("Lý do"), {
      target: { value: "DAMAGED" },
    });
    fireEvent.change(screen.getByLabelText("Mô tả tình trạng"), {
      target: { value: "Sách bị rách nhiều trang khi nhận hàng." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));

    await waitFor(() =>
      expect(mocks.createReturnRequest).toHaveBeenCalledWith(order._id, {
        items: [{ bookId: "507f1f77bcf86cd799439012", quantity: 2 }],
        reason: "DAMAGED",
        details: "Sách bị rách nhiều trang khi nhận hàng.",
        images: ["https://images.example/return-evidence.webp"],
      })
    );
    expect(mocks.success).toHaveBeenCalledWith("Đã gửi yêu cầu đổi trả");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows a resolved request without allowing another submission", () => {
    render(
      <ReturnRequestCard
        order={{
          ...order,
          returnEligibility: { eligible: false, code: "ALREADY_REQUESTED" },
          returnRequest: {
            _id: "return-1",
            status: "REJECTED",
            reason: "QUALITY_ISSUE",
            details: "Chất lượng in không đúng như mô tả.",
            adminNote: "Sản phẩm không thuộc trường hợp được hỗ trợ.",
            images: ["https://images.example/return-evidence.webp"],
            createdAt: "2026-07-31T03:30:00.000Z",
            items: [
              {
                book: "507f1f77bcf86cd799439012",
                title: "Dế Mèn Phiêu Lưu Ký",
                quantity: 1,
                orderedQuantity: 2,
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByText("Đã từ chối")).toBeTruthy();
    expect(screen.getByAltText("ảnh bằng chứng đổi trả 1")).toBeTruthy();
    expect(screen.getByText("Sản phẩm không thuộc trường hợp được hỗ trợ.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tạo yêu cầu đổi trả" })).toBeNull();
  });
});
