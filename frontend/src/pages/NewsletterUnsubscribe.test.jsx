// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const unsubscribe = vi.fn();

vi.mock("@/services/api", () => ({
  newsletterAPI: { unsubscribe: (...args) => unsubscribe(...args) },
}));

import NewsletterUnsubscribe from "./NewsletterUnsubscribe.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NewsletterUnsubscribe", () => {
  it("confirms unsubscribe using the signed token from the URL", async () => {
    unsubscribe.mockResolvedValue({ message: "Đã hủy đăng ký nhận newsletter" });
    render(
      <MemoryRouter initialEntries={["/newsletter/unsubscribe?token=signed-token"]}>
        <NewsletterUnsubscribe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận hủy đăng ký" }));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledWith("signed-token"));
    expect(screen.getByText("Đã hủy đăng ký nhận newsletter")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toBeTruthy();
  });

  it("does not submit without a token", () => {
    render(
      <MemoryRouter initialEntries={["/newsletter/unsubscribe"]}>
        <NewsletterUnsubscribe />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("button", { name: "Xác nhận hủy đăng ký" }).disabled
    ).toBe(true);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
