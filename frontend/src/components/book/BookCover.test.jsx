// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import BookCover from "@/components/book/BookCover";

const wrapper = (c) => c.firstChild;

describe("BookCover", () => {
  it("renders the image when src is present", () => {
    const { container } = render(<BookCover src="/a.jpg" title="Đắc Nhân Tâm" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("alt")).toBe("Đắc Nhân Tâm");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("shows the initial tile when src is missing", () => {
    const { container } = render(<BookCover title="Đắc Nhân Tâm" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("Đ");
  });

  it("falls back to the initial tile when the image errors", () => {
    const { container } = render(<BookCover src="/broken.jpg" title="Nhà Giả Kim" />);
    expect(container.querySelector("img")).toBeTruthy();
    fireEvent.error(container.querySelector("img"));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("N");
  });

  it("blur-up: starts transparent, becomes opaque on load", () => {
    const { container } = render(<BookCover src="/a.jpg" title="X" />);
    const img = container.querySelector("img");
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(container.querySelector("img").className).toContain("opacity-100");
  });

  it("always applies the 3:4 ratio by default", () => {
    const { container } = render(<BookCover src="/a.jpg" title="X" />);
    expect(wrapper(container).className).toContain("aspect-[3/4]");
  });

  it("ratio=free drops the aspect box (article thumbs)", () => {
    const { container } = render(<BookCover src="/a.jpg" title="X" ratio="free" />);
    expect(wrapper(container).className).not.toContain("aspect-[3/4]");
  });

  it("each size maps to one width and one radius", () => {
    const seen = {};
    for (const size of ["xs", "sm", "md", "lg", "full"]) {
      const { container } = render(<BookCover src="/a.jpg" title="X" size={size} />);
      const cls = wrapper(container).className;
      const w = cls.match(/w-(\S+)/)?.[1];
      const r = cls.match(/rounded-(\S+)/)?.[1];
      seen[size] = `${w}/${r}`;
    }
    // no two sizes collide, and every size has both
    expect(Object.values(seen).every((v) => !v.includes("undefined"))).toBe(true);
    expect(new Set(Object.values(seen)).size).toBe(5);
  });

  it("priority switches to eager + high fetchpriority", () => {
    const { container } = render(<BookCover src="/a.jpg" title="X" priority />);
    const img = container.querySelector("img");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("different titles get different tints; same title is stable", () => {
    const tint = (t) => {
      const { container } = render(<BookCover title={t} />);
      // the fallback tile is the wrapper's only child
      return wrapper(container).firstChild.className;
    };
    expect(tint("Đắc Nhân Tâm")).toBe(tint("Đắc Nhân Tâm"));
    const tints = new Set(["A", "B", "C", "D", "E", "F", "G", "H"].map(tint));
    expect(tints.size).toBeGreaterThan(1);
  });

  it("empty title still renders a letter", () => {
    const { container } = render(<BookCover title="" />);
    expect(container.textContent).toBe("B");
  });
});
