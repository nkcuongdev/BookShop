// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PaymentMethods from "./PaymentMethods";

afterEach(cleanup);

describe("PaymentMethods email verification", () => {
  it("disables COD with an explanation and resend action", () => {
    const onChange = vi.fn();
    const onRequestVerification = vi.fn();
    render(
      <PaymentMethods
        value="VNPAY"
        onChange={onChange}
        codDisabled
        codDisabledReason="Bạn cần xác minh email trước khi chọn thanh toán COD."
        onRequestVerification={onRequestVerification}
      />
    );

    expect(screen.getByText(/cần xác minh email/i)).toBeTruthy();
    const cod = screen.getByRole("radio", {
      name: /thanh toán khi nhận hàng/i,
    });
    expect(cod.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /gửi lại email/i }));
    expect(onRequestVerification).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith("COD");
  });
});
