// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileNotifications from "./ProfileNotifications";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getPreferences: vi.fn(),
  markAllRead: vi.fn(),
  markRead: vi.fn(),
  updatePreferences: vi.fn(),
  socket: { on: vi.fn(), off: vi.fn() },
}));

vi.mock("@/services/api", () => ({
  notificationsAPI: {
    getAll: (...args) => mocks.getAll(...args),
    getPreferences: (...args) => mocks.getPreferences(...args),
    markAllRead: (...args) => mocks.markAllRead(...args),
    markRead: (...args) => mocks.markRead(...args),
    updatePreferences: (...args) => mocks.updatePreferences(...args),
  },
}));

vi.mock("@/services/socket", () => ({
  connectSocket: () => mocks.socket,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", emailVerified: true } }),
}));

const preferences = {
  inApp: {
    order: true,
    payment: true,
    shipping: true,
    refund: true,
    chat: true,
    stock: true,
    promotion: true,
    review: true,
    system: true,
  },
  email: {
    order: true,
    payment: true,
    shipping: true,
    refund: true,
    chat: false,
    stock: false,
    promotion: false,
    review: false,
    system: false,
  },
};

beforeEach(() => {
  mocks.getAll.mockResolvedValue({
    data: {
      notifications: [
        {
          _id: "notification-1",
          type: "shipping",
          title: "Đơn hàng đang giao",
          message: "Đơn hàng OD-1 đang trên đường giao.",
          link: "/profile/orders/1",
          readAt: null,
          createdAt: "2026-07-31T10:00:00.000Z",
        },
      ],
      unreadCount: 1,
      pagination: { page: 1, totalPages: 1, total: 1 },
    },
  });
  mocks.getPreferences.mockResolvedValue({
    data: { preferences, emailVerified: true },
  });
  mocks.markRead.mockResolvedValue({ success: true });
  mocks.markAllRead.mockResolvedValue({ success: true });
  mocks.updatePreferences.mockImplementation(async (next) => ({
    data: { preferences: next },
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProfileNotifications", () => {
  it("opens a notification after marking it as read", async () => {
    render(
      <MemoryRouter initialEntries={["/profile/notifications"]}>
        <Routes>
          <Route path="/profile/notifications" element={<ProfileNotifications />} />
          <Route path="/profile/orders/1" element={<p>Chi tiết đơn hàng</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const notification = await screen.findByRole("button", {
      name: /đơn hàng đang giao/i,
    });
    fireEvent.click(notification);

    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith("notification-1"));
    expect(await screen.findByText("Chi tiết đơn hàng")).toBeTruthy();
  });

  it("saves per-channel notification preferences", async () => {
    render(
      <MemoryRouter>
        <ProfileNotifications />
      </MemoryRouter>,
    );

    const shippingInApp = await screen.findByRole("checkbox", {
      name: "Nhận Giao hàng trong ứng dụng",
    });
    expect(shippingInApp.getAttribute("data-state")).toBe("checked");
    fireEvent.click(shippingInApp);
    fireEvent.click(screen.getByRole("button", { name: /lưu tùy chọn/i }));

    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalled());
    expect(mocks.updatePreferences.mock.calls[0][0].inApp.shipping).toBe(false);
  });
});
