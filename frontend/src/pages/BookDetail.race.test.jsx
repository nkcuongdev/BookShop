// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getAllBooks: vi.fn(),
  getCategories: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  booksAPI: {
    getById: mocks.getById,
    getAll: mocks.getAllBooks,
    canReview: vi.fn(),
    getReviews: vi.fn(),
    createReview: vi.fn(),
  },
  categoriesAPI: { getAll: mocks.getCategories },
  eventsAPI: { track: vi.fn() },
}));
vi.mock("@/context/AuthContext.jsx", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/context/CartContext.jsx", () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));
vi.mock("@/hooks/useRecentlyViewed", () => ({
  default: () => ({ add: vi.fn() }),
}));
vi.mock("@/hooks/useWishlist", () => ({
  default: () => ({ isWishlisted: () => false, toggle: vi.fn() }),
}));
vi.mock("@/components/common/Rating", () => ({ default: () => null }));
vi.mock("@/components/common/PriceTag", () => ({ default: () => null }));
vi.mock("@/components/common/QuantityInput", () => ({ default: () => null }));
vi.mock("@/components/common/TrustBadgeRow", () => ({ default: () => null }));
vi.mock("@/components/common/EmptyState", () => ({
  default: ({ title, description, action }) => (
    <div>
      <span>{title}</span>
      <span>{description}</span>
      {action}
    </div>
  ),
}));
vi.mock("@/components/book/RecommendationRail", () => ({ default: () => null }));
vi.mock("@/components/review/ReviewList", () => ({ default: () => null }));
vi.mock("@/components/review/ReviewForm", () => ({ default: () => null }));
vi.mock("@/components/review/RatingSummary", () => ({ default: () => null }));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div>detail-loading</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }) => <div>{children}</div>,
  TabsContent: ({ children }) => <div>{children}</div>,
  TabsList: ({ children }) => <div>{children}</div>,
  TabsTrigger: ({ children }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }) => <div>{children}</div>,
  BreadcrumbItem: ({ children }) => <div>{children}</div>,
  BreadcrumbLink: ({ children }) => <div>{children}</div>,
  BreadcrumbList: ({ children }) => <div>{children}</div>,
  BreadcrumbPage: ({ children }) => <div>{children}</div>,
  BreadcrumbSeparator: () => null,
}));
vi.mock("@/components/ui/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import BookDetail from "./BookDetail.jsx";
import { ConfirmProvider } from "@/hooks/useConfirm";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Harness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/books/b")}>open-b</button>
      <Routes>
        <Route path="/books/:id" element={<BookDetail />} />
      </Routes>
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.getCategories.mockResolvedValue({ success: true, data: { categories: [] } });
  mocks.getAllBooks.mockResolvedValue({ success: true, data: { books: [] } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("BookDetail route state", () => {
  it("never retains the previous book when the new route fails", async () => {
    const firstRequest = deferred();
    const secondRequest = deferred();
    mocks.getById
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    render(
      <MemoryRouter initialEntries={["/books/a"]}>
        <ConfirmProvider>
          <Harness />
        </ConfirmProvider>
      </MemoryRouter>
    );

    await act(async () => {
      firstRequest.resolve({
        success: true,
        data: {
          book: {
            _id: "a",
            title: "Alpha Book",
            category: "fiction",
            price: 100,
            stock: 5,
          },
          reviews: [],
        },
      });
    });
    expect(await screen.findByRole("heading", { name: "Alpha Book" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "open-b" }));
    await waitFor(() => expect(mocks.getById).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("heading", { name: "Alpha Book" })).toBeNull();

    await act(async () => {
      secondRequest.reject(new Error("Book B request failed"));
    });
    expect(await screen.findByText("Book B request failed")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Alpha Book" })).toBeNull();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});
