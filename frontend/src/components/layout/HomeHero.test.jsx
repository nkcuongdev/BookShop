// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HomeHero from "@/components/layout/HomeHero";

const BOOKS = {
  bestSellers: [
    { _id: "b1", title: "Nhà Giả Kim", author: "Paulo Coelho", imageUrl: "/c1.jpg", price: 90000 },
    { _id: "b2", title: "Đắc Nhân Tâm", author: "Dale Carnegie", imageUrl: "/c2.jpg", price: 80000 },
  ],
  newArrivals: [
    { _id: "b3", title: "Tuổi Trẻ Đáng Giá", author: "Rosie Nguyễn", imageUrl: "/c3.jpg", price: 70000 },
  ],
};

const setup = (props) =>
  render(
    <MemoryRouter>
      <HomeHero {...props} />
    </MemoryRouter>
  );

afterEach(cleanup);

describe("HomeHero", () => {
  it("states one message under a single h1", () => {
    const { container, getByText } = setup();
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain("Khám phá cuốn sách tiếp theo dành cho bạn");
    expect(getByText("BookShop tuyển chọn")).toBeTruthy();
  });

  it("offers exactly two calls to action, pointing where they claim", () => {
    const { container, getByText } = setup();
    expect(getByText("Khám phá sách").closest("a").getAttribute("href")).toBe("/products");
    expect(getByText("Xem sách bán chạy").closest("a").getAttribute("href")).toBe(
      "/products?sort=bestseller"
    );

    // Without books there are no cover links, so these are the only two.
    expect(container.querySelectorAll("a")).toHaveLength(2);
  });

  it("has no carousel machinery left", () => {
    const { container } = setup({ books: BOOKS });
    // Each of these was load-bearing for the rotating hero and is now dead
    // weight: tabs/dots, prev/next arrows, and the slide-change announcer.
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(container.querySelector('[aria-roledescription="carousel"]')).toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[aria-label="Slide trước"]')).toBeNull();
    expect(container.querySelector('[aria-label="Slide sau"]')).toBeNull();
    expect(container.querySelector("[data-hero-progress]")).toBeNull();
  });

  it("never changes on its own — no timer is running", () => {
    vi.useFakeTimers();
    try {
      const { container } = setup({ books: BOOKS });
      const before = container.innerHTML;
      act(() => void vi.advanceTimersByTime(60000));
      // A minute of wall clock must not move a static hero.
      expect(container.innerHTML).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("requests no images at all", () => {
    // The shelf is CSS artwork, so the hero — the topmost thing on the page —
    // issues zero image requests and has no LCP image to wait on.
    const { container } = setup({ books: BOOKS });
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("unsplash");
  });

  it("shows the same shelf whether or not the catalogue loaded", () => {
    // The hero cannot flash a placeholder or shift when the API answers,
    // because it never depended on the answer.
    const { container: withData } = setup({ books: BOOKS });
    const loaded = withData.innerHTML;
    cleanup();
    const { container: without } = setup();
    expect(without.innerHTML).toBe(loaded);
  });

  it("renders without books — the state the page is in until the API answers", () => {
    const { container, getByText } = setup();
    expect(getByText("Khám phá cuốn sách tiếp theo dành cho bạn")).toBeTruthy();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("unsplash");
  });

  it("labels the section by its own heading", () => {
    const { container } = setup();
    const section = container.querySelector("section");
    expect(section.getAttribute("aria-labelledby")).toBe("home-hero-title");
    expect(container.querySelector("#home-hero-title")).toBe(container.querySelector("h1"));
  });

  it("gates its entrance animations behind motion-safe", () => {
    // The hero animates in once. Under prefers-reduced-motion it must not.
    const { container } = setup({ books: BOOKS });
    const animated = [...container.querySelectorAll('[class*="animate-in"]')];
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((el) => expect(el.className).toContain("motion-safe:animate-in"));
  });
});
