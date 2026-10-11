// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import CancelOrderDialog from "./CancelOrderDialog.jsx";

function Harness({ onConfirm, resetOnClose }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        mở lại
      </button>
      <CancelOrderDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={onConfirm}
        resetOnClose={resetOnClose}
      />
    </>
  );
}

const reasonBox = () => screen.getByPlaceholderText("Nhập lý do cụ thể...");

afterEach(() => cleanup());

describe("CancelOrderDialog (R-B2)", () => {
  it("clears the reason when dismissed with resetOnClose", async () => {
    render(<Harness onConfirm={vi.fn()} resetOnClose />);
    fireEvent.change(reasonBox(), { target: { value: "Hết hàng" } });
    fireEvent.click(screen.getByRole("button", { name: "Không, giữ đơn" }));
    fireEvent.click(screen.getByRole("button", { name: "mở lại" }));
    await waitFor(() => expect(reasonBox().value).toBe(""));
  });

  it("keeps the reason when the cancellation fails", async () => {
    const onConfirm = vi.fn(async () => false);
    render(<Harness onConfirm={onConfirm} resetOnClose />);
    fireEvent.change(reasonBox(), { target: { value: "Khách yêu cầu huỷ" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Khách yêu cầu huỷ"));
    expect(reasonBox().value).toBe("Khách yêu cầu huỷ");
  });

  it("keeps the customer-page behaviour without resetOnClose", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.change(reasonBox(), { target: { value: "Tôi đổi ý" } });
    fireEvent.click(screen.getByRole("button", { name: "Không, giữ đơn" }));
    fireEvent.click(screen.getByRole("button", { name: "mở lại" }));
    expect(reasonBox().value).toBe("Tôi đổi ý");
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));
    await waitFor(() => expect(reasonBox().value).toBe(""));
  });
});
