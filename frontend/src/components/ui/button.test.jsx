// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its label", () => {
    const { container } = render(<Button>Đặt hàng</Button>);
    expect(container.textContent).toBe("Đặt hàng");
  });

  it("loading shows a spinner, disables, and sets aria-busy", () => {
    const { container } = render(<Button loading>Đặt hàng</Button>);
    const btn = container.querySelector("button");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    // label is kept unless loadingText is given
    expect(container.textContent).toContain("Đặt hàng");
  });

  it("loadingText replaces the label while loading", () => {
    const { container } = render(
      <Button loading loadingText="Đang xử lý...">
        Đặt hàng
      </Button>
    );
    expect(container.textContent).toContain("Đang xử lý...");
    expect(container.textContent).not.toContain("Đặt hàng");
  });

  it("not loading: no spinner, no aria-busy", () => {
    const { container } = render(<Button>Đặt hàng</Button>);
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector("button").getAttribute("aria-busy")).toBeNull();
  });

  it("an explicit disabled still wins when not loading", () => {
    const { container } = render(<Button disabled>Đặt hàng</Button>);
    expect(container.querySelector("button").disabled).toBe(true);
  });

  it("asChild renders the child element, not a button", () => {
    const { container } = render(
      <Button asChild>
        <a href="/cart">Giỏ hàng</a>
      </Button>
    );
    expect(container.querySelector("button")).toBeNull();
    const a = container.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.getAttribute("href")).toBe("/cart");
    expect(a.textContent).toBe("Giỏ hàng");
  });

  // The orange accent colour is exposed to Tailwind as the `brand` COLOR key, so
  // the retired `shadow-`+`brand` utility resolved to a shadow-COLOR
  // (--tw-shadow-color: hsl(var(--brand-accent))) and painted an ORANGE halo on
  // this indigo button. Guard the rename so the glow cannot drift back.
  //
  // The retired name is assembled at runtime rather than written as a literal:
  // Tailwind scans this file for class strings, and a literal would make it emit
  // that dead rule into the production stylesheet. Same reason the name is
  // never spelled out in these comments.
  it("default variant carries the indigo primary glow, not the retired brand glow", () => {
    const retired = `shadow-${"brand"}`;
    const { container } = render(<Button>Đặt hàng</Button>);
    const cls = container.querySelector("button").className;
    expect(cls).toContain("shadow-primary-glow");
    expect(cls.split(/\s+/)).not.toContain(retired);
    expect(cls.split(/\s+/)).not.toContain(`${retired}-lg`);
  });

  it("asChild + loading does NOT inject a spinner (Slot takes one child)", () => {
    const { container } = render(
      <Button asChild loading>
        <a href="/cart">Giỏ hàng</a>
      </Button>
    );
    const a = container.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.textContent).toBe("Giỏ hàng");
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
