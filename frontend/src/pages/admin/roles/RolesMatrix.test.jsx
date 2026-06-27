// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  permissions: { value: ["*"] },
  roles: { value: [] },
  groups: { value: [] },
  deleteRole: vi.fn(),
}));

vi.mock("@/context/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "admin", permissions: mocks.permissions.value },
    loading: false,
  }),
}));

vi.mock("@/features/admin/roles/hooks", () => ({
  useRoles: () => ({ data: mocks.roles.value, isLoading: false, isError: false }),
  usePermissionCatalog: () => ({
    data: { groups: mocks.groups.value, adminOnly: ["user.manage"] },
    isLoading: false,
    isError: false,
  }),
  useDeleteRole: () => ({ mutate: mocks.deleteRole, isPending: false }),
}));

vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

import RolesMatrix from "./RolesMatrix.jsx";

const renderMatrix = () =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <RolesMatrix />
      </TooltipProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.value = ["*"];
  mocks.roles.value = [
    {
      key: "admin",
      label: "Quản trị viên",
      permissions: ["*"],
      isSystem: true,
      isLocked: true,
      userCount: 1,
    },
    {
      key: "warehouse",
      label: "Nhân viên kho",
      permissions: ["admin.access", "inventory.read"],
      isSystem: true,
      isLocked: false,
      userCount: 3,
    },
    {
      key: "headofstock",
      label: "Trưởng kho",
      permissions: ["admin.access", "inventory.read", "user.manage"],
      isSystem: false,
      isLocked: false,
      userCount: 0,
    },
  ];
  mocks.groups.value = [
    {
      group: "Tồn kho",
      items: [
        { key: "inventory.read", label: "Đọc tồn kho", description: "Xem tồn" },
        {
          key: "inventory.adjust",
          label: "Điều chỉnh tồn",
          description: "Sửa tồn trực tiếp",
          sensitive: true,
        },
      ],
    },
    {
      group: "Hệ thống",
      items: [
        {
          key: "user.manage",
          label: "Quản lý người dùng",
          description: "Đổi vai trò",
          sensitive: true,
          adminOnly: true,
        },
      ],
    },
  ];
});

afterEach(cleanup);

describe("RolesMatrix", () => {
  it("shows every role as a column with its holder count", () => {
    renderMatrix();

    expect(screen.getByText("Quản trị viên")).toBeTruthy();
    expect(screen.getByText("Nhân viên kho")).toBeTruthy();
    expect(screen.getByText("Trưởng kho")).toBeTruthy();
    // The count links through to the filtered user list.
    const link = screen.getByRole("link", { name: /3/ });
    expect(link.getAttribute("href")).toBe("/admin/users?role=warehouse");
  });

  it("marks which roles hold each permission", () => {
    renderMatrix();

    const row = screen.getByText("Đọc tồn kho").closest("tr");
    // admin via wildcard, warehouse and headofstock explicitly: three ticks.
    expect(within(row).getAllByLabelText("Có quyền")).toHaveLength(3);
    expect(within(row).queryAllByLabelText("Không có quyền")).toHaveLength(0);

    const adjustRow = screen.getByText("Điều chỉnh tồn").closest("tr");
    // Only the wildcard admin holds it.
    expect(within(adjustRow).getAllByLabelText("Có quyền")).toHaveLength(1);
    expect(within(adjustRow).getAllByLabelText("Không có quyền")).toHaveLength(2);
  });

  it("groups permissions by business area", () => {
    renderMatrix();

    expect(screen.getByText("Tồn kho")).toBeTruthy();
    expect(screen.getByText("Hệ thống")).toBeTruthy();
  });

  it("offers edit for editable roles and locks the fixed ones", () => {
    renderMatrix();

    expect(screen.getByLabelText("Sửa Nhân viên kho")).toBeTruthy();
    expect(screen.getByLabelText("Sửa Trưởng kho")).toBeTruthy();
    // The admin role is locked, so it gets no edit control at all.
    expect(screen.queryByLabelText("Sửa Quản trị viên")).toBeNull();
  });

  it("offers delete only for custom roles", () => {
    renderMatrix();

    expect(screen.getByLabelText("Xoá Trưởng kho")).toBeTruthy();
    // System roles cannot be deleted, so the button is not rendered.
    expect(screen.queryByLabelText("Xoá Nhân viên kho")).toBeNull();
    expect(screen.queryByLabelText("Xoá Quản trị viên")).toBeNull();
  });

  it("hides every editing control from a reader who cannot manage roles", () => {
    mocks.permissions.value = ["admin.access", "role.read"];
    renderMatrix();

    // The matrix itself still renders — that is what role.read buys.
    expect(screen.getByText("Nhân viên kho")).toBeTruthy();
    expect(screen.getByText("Đọc tồn kho")).toBeTruthy();

    expect(screen.queryByRole("button", { name: /Thêm vai trò/ })).toBeNull();
    expect(screen.queryByLabelText("Sửa Nhân viên kho")).toBeNull();
    expect(screen.queryByLabelText("Xoá Trưởng kho")).toBeNull();
  });
});
