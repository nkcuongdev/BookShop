// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ getAll: vi.fn() }));

vi.mock("@/services/api", () => ({ booksAPI: { getAll: mocks.getAll } }));
vi.mock("@/context/CategoryContext.jsx", () => ({
  useCategories: () => ({
    categories: [
      { slug: "old", name: "Old" },
      { slug: "new", name: "New" },
    ],
  }),
}));
vi.mock("@/components/book/BookCard", () => ({
  default: ({ book }) => <div>{book.title}</div>,
}));
vi.mock("@/components/book/BookCardSkeleton", () => ({
  BookGridSkeleton: () => <div>loading-books</div>,
}));
vi.mock("@/components/filter/FilterSidebar", () => ({
  default: ({ onCategoryChange }) => (
    <button type="button" onClick={() => onCategoryChange("new")}>
      choose-new-category
    </button>
  ),
}));
vi.mock("@/components/filter/SortSelect", () => ({
  default: () => null,
}));
vi.mock("@/components/filter/ActiveFilterChips", () => ({
  default: () => null,
}));
vi.mock("@/components/common/EmptyState", () => ({
  default: ({ title, description, action }) => (
    <div>
      <span>{title}</span>
      <span>{description}</span>
      {action}
    </div>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }) => <div>{children}</div>,
  SheetContent: ({ children }) => <div>{children}</div>,
  SheetHeader: ({ children }) => <div>{children}</div>,
  SheetTitle: ({ children }) => <div>{children}</div>,
  SheetTrigger: ({ children }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }) => <div>{children}</div>,
  BreadcrumbItem: ({ children }) => <div>{children}</div>,
  BreadcrumbLink: ({ children }) => <div>{children}</div>,
  BreadcrumbList: ({ children }) => <div>{children}</div>,
  BreadcrumbPage: ({ children }) => <div>{children}</div>,
  BreadcrumbSeparator: () => null,
}));

import ProductList from "./ProductList.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ProductList request ordering", () => {
  it("ignores an older response after the active filter changes", async () => {
    const oldRequest = deferred();
    const newRequest = deferred();
    mocks.getAll
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    render(
      <MemoryRouter initialEntries={["/products?category=old"]}>
        <ProductList />
      </MemoryRouter>
    );

    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getAllByRole("button", { name: "choose-new-category" })[0]
    );
    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledTimes(2));

    await act(async () => {
      newRequest.resolve({
        success: true,
        data: { books: [{ _id: "new-book", title: "New Book" }], pagination: { total: 1 } },
      });
    });
    expect(await screen.findByText("New Book")).toBeTruthy();

    await act(async () => {
      oldRequest.resolve({
        success: true,
        data: { books: [{ _id: "old-book", title: "Old Book" }], pagination: { total: 1 } },
      });
    });
    expect(screen.queryByText("Old Book")).toBeNull();
    expect(screen.getByText("New Book")).toBeTruthy();
  });
});
