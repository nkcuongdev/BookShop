// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminOverview: vi.fn(),
  sendContent: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  newsletterAPI: {
    getAdminOverview: mocks.getAdminOverview,
    sendContent: mocks.sendContent,
  },
}));

vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

vi.mock("@/components/ui/select", () => {
  let latestOnValueChange = () => {};
  return {
    Select: ({ onValueChange, children }) => {
      latestOnValueChange = onValueChange;
      return <div>{children}</div>;
    },
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem: ({ value, children }) => (
      <button type="button" onClick={() => latestOnValueChange(value)}>
        {children}
      </button>
    ),
    SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
    SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  };
});

import NewsletterManager from "./NewsletterManager.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NewsletterManager", () => {
  it("loads eligible content and sends the selected post after confirmation", async () => {
    mocks.getAdminOverview.mockResolvedValue({
      data: {
        activeSubscriberCount: 2,
        mailEnabled: true,
        posts: [
          {
            id: "507f1f77bcf86cd799439011",
            title: "Sách hay tháng này",
            description: "Danh sách tuyển chọn.",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
        promotions: [],
        vouchers: [],
      },
    });
    mocks.confirm.mockResolvedValue(true);
    mocks.sendContent.mockResolvedValue({
      data: {
        recipientCount: 2,
        deliveredCount: 2,
        previewCount: 0,
        failedCount: 0,
      },
    });

    render(<NewsletterManager />);

    expect(await screen.findByText("2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sách hay tháng này" }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi newsletter" }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.sendContent).toHaveBeenCalledWith({
        contentType: "post",
        contentId: "507f1f77bcf86cd799439011",
      })
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Đã gửi newsletter tới 2 người nhận"
    );
  });
});
