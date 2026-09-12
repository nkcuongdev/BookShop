// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authState = vi.hoisted(() => ({ value: { user: null, loading: false } }));

vi.mock("@/context/AuthContext.jsx", () => ({
  useAuth: () => authState.value,
}));
vi.mock("@/components/admin/layout/AdminSidebar", () => ({
  AdminSidebar: () => <aside>admin-sidebar</aside>,
}));
vi.mock("@/components/admin/layout/AdminTopbar", () => ({
  AdminTopbar: () => <header>admin-topbar</header>,
}));

import AdminLayout from "./AdminLayout.jsx";

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/" element={<div>storefront</div>} />
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div>admin-content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  authState.value = { user: null, loading: false };
});

/**
 * A session as /api/auth/me returns it: the permission list comes from the
 * server, so the guard never needs to know which roles exist.
 */
const session = (role, permissions) => ({
  user: { id: `${role}-1`, role, permissions },
  loading: false,
});

describe("AdminLayout authorization", () => {
  it("sends a signed-out visitor to the login page", () => {
    authState.value = { user: null, loading: false };
    renderAdminRoute();
    expect(screen.getByText("login-page")).toBeTruthy();
    expect(screen.queryByText("admin-content")).toBeNull();
  });

  it("redirects a normal customer away from admin routes", () => {
    authState.value = session("user", []);
    renderAdminRoute();
    expect(screen.getByText("storefront")).toBeTruthy();
    expect(screen.queryByText("admin-content")).toBeNull();
  });

  it("renders nested admin content for an administrator", () => {
    authState.value = session("admin", ["*"]);
    renderAdminRoute();
    expect(screen.getByText("admin-sidebar")).toBeTruthy();
    expect(screen.getByText("admin-content")).toBeTruthy();
  });

  // The gate is admin.access, not a role name, so a role an admin invents at
  // runtime gets in on exactly the same basis as the built-in ones.
  it.each(["warehouse", "support", "content", "accounting", "headofstock"])(
    "lets %s staff into the admin shell",
    (role) => {
      authState.value = session(role, ["admin.access", "dashboard.view"]);
      renderAdminRoute();
      expect(screen.getByText("admin-sidebar")).toBeTruthy();
      expect(screen.getByText("admin-content")).toBeTruthy();
    }
  );

  it("refuses a staff-looking role that lacks admin.access", () => {
    authState.value = session("halfstaff", ["dashboard.view", "book.read"]);
    renderAdminRoute();
    expect(screen.getByText("storefront")).toBeTruthy();
    expect(screen.queryByText("admin-content")).toBeNull();
  });
});
