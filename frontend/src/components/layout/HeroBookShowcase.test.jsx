// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import HeroBookShowcase from "@/components/layout/HeroBookShowcase";

const setup = (props) => render(<HeroBookShowcase {...props} />);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The shelf is fixed artwork built in plain CSS, so the useful tests are about
 * the scene's structure and the "fetches nothing" contract. Geometry itself
 * lives in HeroBookShowcase.css and is asserted through the class contract
 * rather than by re-deriving angles here — jsdom applies no stylesheet, so a
 * numeric assertion in this file would be testing the test's own arithmetic.
 */
describe("HeroBookShowcase", () => {
  it("renders five books with no data and no router", () => {
    // No MemoryRouter on purpose: if a Link ever creeps back in, this throws
    // rather than silently coupling the hero to a router context.
    const { container } = setup();
    expect(container.querySelectorAll(".hs-book")).toHaveLength(5);
  });

  it("fetches nothing and links nowhere", () => {
    const { container } = setup();
    // No <img>: the covers are drawn in CSS, so the topmost thing on the page
    // issues no image request and has no LCP image to wait on.
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("unsplash");
    expect(container.innerHTML).not.toContain("http");
  });

  it("ignores any props left over from the data-driven version", () => {
    const { container: bare } = setup();
    const plain = bare.innerHTML;
    cleanup();
    const { container: withProps } = setup({
      books: { bestSellers: [{ _id: "x", title: "Không được hiện" }] },
      priority: true,
    });
    expect(withProps.innerHTML).toBe(plain);
    expect(withProps.textContent).not.toContain("Không được hiện");
  });

  it("keeps perspective and preserve-3d on separate elements", () => {
    // The bug this guards: perspective applies only to a DIRECT child, so if
    // the stage and the rig are ever collapsed into one element — or a plain
    // wrapper is inserted between them — every book's translateZ flattens and
    // the shelf renders as five tilted rectangles with no visible spine.
    const { container } = setup();
    const stage = container.querySelector(".hs-stage");
    const rig = container.querySelector(".hs-rig");
    expect(stage).toBeTruthy();
    expect(rig).toBeTruthy();
    expect(rig.parentElement).toBe(stage);
    expect([...rig.children].every((el) => el.classList.contains("hs-book"))).toBe(true);
  });

  it("builds each book as a solid, not a rotated rectangle", () => {
    const { container } = setup();
    container.querySelectorAll(".hs-book").forEach((book) => {
      // Cover, spine, page block and top edge — the four faces that make the
      // book an object. Drop any one and it reads as a card again.
      expect(book.querySelector(".hs-cover")).toBeTruthy();
      expect(book.querySelector(".hs-spine")).toBeTruthy();
      expect(book.querySelector(".hs-pages")).toBeTruthy();
      expect(book.querySelector(".hs-top-edge")).toBeTruthy();
      // The idle bob wrapper has to sit inside the book, not replace it.
      expect(book.querySelector(".hs-float")).toBeTruthy();
    });
  });

  it("places one book per slot, centre out", () => {
    const { container } = setup();
    const slots = [...container.querySelectorAll(".hs-book")].map(
      (b) => [...b.classList].find((c) => c.startsWith("hs-book--"))
    );
    expect(slots).toEqual([
      "hs-book--far-l",
      "hs-book--l",
      "hs-book--c",
      "hs-book--r",
      "hs-book--far-r",
    ]);
  });

  it("gives every cover its own motif and emblem", () => {
    const { container } = setup();
    // Five identical covers in five colours would read as one template.
    const motifs = [...container.querySelectorAll(".hs-cover")].map(
      (c) => [...c.classList].find((x) => x.startsWith("hs-cover--"))
    );
    expect(new Set(motifs).size).toBe(5);

    const glyphs = [...container.querySelectorAll(".hs-cover-glyph")];
    expect(glyphs).toHaveLength(5);
    expect(new Set(glyphs.map((g) => g.innerHTML)).size).toBe(5);
  });

  it("prints a spine label on every book", () => {
    const { container } = setup();
    const spines = [...container.querySelectorAll(".hs-spine-text")];
    expect(spines).toHaveLength(5);
    spines.forEach((s) => expect(s.textContent.trim().length).toBeGreaterThan(0));
  });

  it("tilts toward a mouse and returns to rest when it leaves", () => {
    const { container } = setup();
    const stage = container.querySelector(".hs-stage");
    const rig = container.querySelector(".hs-rig");
    stage.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0,
    });

    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    fireEvent.pointerMove(stage, { pointerType: "mouse", clientX: 400, clientY: 150 });
    // Far right edge, vertically centred: full positive yaw, no pitch.
    expect(rig.style.getPropertyValue("--ry")).toBe("9.00deg");
    expect(parseFloat(rig.style.getPropertyValue("--rx"))).toBe(0);
    expect(stage.classList.contains("hs-tracking")).toBe(true);
    // The sheen tracks the same axis, so the highlight follows the cursor.
    const covers = [...container.querySelectorAll(".hs-cover")];
    expect(covers.every((c) => c.style.getPropertyValue("--sheen-x") === "42.0")).toBe(true);

    fireEvent.pointerLeave(stage);
    expect(rig.style.getPropertyValue("--ry")).toBe("0deg");
    expect(rig.style.getPropertyValue("--rx")).toBe("0deg");
    expect(stage.classList.contains("hs-tracking")).toBe(false);

    raf.mockRestore();
  });

  it("does not tilt for touch or for reduced motion", () => {
    const { container } = setup();
    const stage = container.querySelector(".hs-stage");
    const rig = container.querySelector(".hs-rig");
    stage.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0,
    });

    // A touch "tilt" only fires mid-tap, which reads as a glitch.
    fireEvent.pointerMove(stage, { pointerType: "touch", clientX: 400, clientY: 150 });
    expect(rig.style.getPropertyValue("--ry")).toBe("");

    // jsdom ships no matchMedia, so this also covers the optional-chaining
    // guard: define it, assert the tilt is skipped, then remove it again and
    // confirm the handler still does not throw.
    window.matchMedia = () => ({ matches: true });
    fireEvent.pointerMove(stage, { pointerType: "mouse", clientX: 400, clientY: 150 });
    expect(rig.style.getPropertyValue("--ry")).toBe("");

    delete window.matchMedia;
    expect(() =>
      fireEvent.pointerMove(stage, { pointerType: "mouse", clientX: 400, clientY: 150 })
    ).not.toThrow();
  });

  it("carries no caption under the shelf", () => {
    // Every title is already printed on its own cover; repeating one of them
    // below the shelf labelled the artwork as if it were a product listing.
    const { container } = setup();
    expect(container.querySelector("p")).toBeNull();
    // The centre title still appears on the shelf — on its cover and spine.
    expect(container.textContent).toContain("Nhà Giả Kim");
  });

  it("keeps each cover's title and author on their own lines", () => {
    // The prototype used <div>s here, so block layout came for free. Rendered
    // as <span> they run together — "Nhà Giả KimPaulo Coelho" — unless the
    // stylesheet sets display itself. jsdom applies no stylesheet, so read the
    // rule out of the CSS file rather than trusting a computed style that will
    // always say "inline" here.
    // Resolved from the project root: under jsdom `import.meta.url` is not a
    // file: URL, so it cannot be handed to readFileSync.
    const css = readFileSync(
      "src/components/layout/HeroBookShowcase.css",
      "utf8"
    );
    [".hs-cover-title", ".hs-cover-author", ".hs-cover-rule"].forEach((sel) => {
      const rule = css.match(
        new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`)
      );
      expect(rule, `${sel} has no rule`).toBeTruthy();
      expect(rule[1], `${sel} must not be inline`).toMatch(/display:\s*block/);
    });

    const { container } = setup();
    [".hs-cover-title", ".hs-cover-author"].forEach((sel) =>
      expect(container.querySelector(sel)).toBeTruthy()
    );
  });

  it("hides the whole shelf from assistive tech", () => {
    // It is decoration: the hero's message and actions live in the copy beside
    // it, so announcing five book titles adds noise, not information.
    const { container } = setup();
    expect(container.firstChild.getAttribute("aria-hidden")).toBe("true");
  });
});
