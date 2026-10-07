// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// jsdom has no AnimationEvent, and React DOM decides at import time which
// event name backs onAnimationEnd: without it React listens for the prefixed
// `webkitAnimationEnd`, so fireEvent.animationEnd would never reach the
// carousel. Define it before react-dom loads, as every real browser does.
vi.hoisted(() => {
  if (typeof window !== "undefined" && !("AnimationEvent" in window)) {
    window.AnimationEvent = window.Event;
  }
});

import { render, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HeroCarousel from "@/components/home/HeroCarousel";
import {
  HERO_SLIDES,
  SIDE_BANNERS,
  BANNER_WIDTH,
  BANNER_HEIGHT,
  activeBanners,
  bannerSrcSet,
} from "@/features/home/banners";

const banner = (id, href) => ({
  id,
  src: `/banners/${id}.webp`,
  srcSmall: `/banners/${id}-960.webp`,
  width: BANNER_WIDTH,
  height: BANNER_HEIGHT,
  alt: `Banner ${id}`,
  href,
});

const SLIDES = [
  banner("a", "/products?sort=bestseller"),
  banner("b", "/products?category=van-hoc"),
  banner("c", "/products?search=x"),
];

let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  // jsdom ships no matchMedia; the carousel reads prefers-reduced-motion.
  window.matchMedia = (query) => ({
    matches: query.includes("reduce") ? reducedMotion : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

afterEach(() => {
  cleanup();
  delete window.matchMedia;
});

const setup = (props) =>
  render(
    <MemoryRouter>
      <HeroCarousel slides={SLIDES} {...props} />
    </MemoryRouter>
  );

const activeLabel = (container) =>
  container
    .querySelector('[aria-roledescription="slide"][data-active]')
    .getAttribute("aria-label");

describe("HeroCarousel", () => {
  it("shows one slide at a time and takes the others out of the tab order", () => {
    const { container } = setup();
    const slides = [...container.querySelectorAll('[aria-roledescription="slide"]')];
    expect(slides).toHaveLength(3);
    expect(activeLabel(container)).toBe("1 / 3");
    expect(slides.map((s) => s.hasAttribute("inert"))).toEqual([false, true, true]);
    expect(slides.map((s) => s.getAttribute("aria-hidden"))).toEqual(["false", "true", "true"]);
  });

  it("renders each slide as its image, linked to its page, with no text overlay", () => {
    const { container } = setup();
    const slides = [...container.querySelectorAll('[aria-roledescription="slide"]')];
    slides.forEach((slide, i) => {
      const link = slide.querySelector("a");
      expect(link.getAttribute("href")).toBe(SLIDES[i].href);
      const img = link.querySelector("img");
      expect(img.getAttribute("alt")).toBe(SLIDES[i].alt);
      // The artwork carries its own copy: nothing but the image is in the link.
      expect(link.textContent).toBe("");
      expect(img.getAttribute("width")).toBe(String(BANNER_WIDTH));
      expect(img.getAttribute("height")).toBe(String(BANNER_HEIGHT));
      expect(img.className).toContain("object-contain");
      expect(img.getAttribute("srcset")).toBe(bannerSrcSet(SLIDES[i]));
    });
  });

  it("loads the first slide eagerly and the rest lazily", () => {
    const { container } = setup();
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs[0].getAttribute("loading")).toBe("eager");
    expect(imgs[0].getAttribute("fetchpriority")).toBe("high");
    expect(imgs.slice(1).every((img) => img.getAttribute("loading") === "lazy")).toBe(true);
  });

  it("shows the banner text when an image fails to load", () => {
    const { container } = setup();
    fireEvent.error(container.querySelector("img"));
    const fallback = container.querySelector('[role="img"]');
    expect(fallback.textContent).toBe(SLIDES[0].alt);
    expect(fallback.closest("a").getAttribute("href")).toBe(SLIDES[0].href);
  });

  it("navigates with the arrows, wrapping at both ends", () => {
    const { container, getByLabelText } = setup();
    fireEvent.click(getByLabelText("Banner tiếp theo"));
    expect(activeLabel(container)).toBe("2 / 3");
    fireEvent.click(getByLabelText("Banner trước"));
    fireEvent.click(getByLabelText("Banner trước"));
    expect(activeLabel(container)).toBe("3 / 3");
    fireEvent.click(getByLabelText("Banner tiếp theo"));
    expect(activeLabel(container)).toBe("1 / 3");
  });

  it("jumps to a slide from its dot and marks that dot current", () => {
    const { container, getByLabelText } = setup();
    const dot = getByLabelText("Xem banner 3");
    fireEvent.click(dot);
    expect(activeLabel(container)).toBe("3 / 3");
    expect(dot.getAttribute("aria-current")).toBe("true");
  });

  it("supports the arrow keys", () => {
    const { container } = setup();
    const region = container.querySelector('[aria-roledescription="carousel"]');
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(activeLabel(container)).toBe("2 / 3");
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(activeLabel(container)).toBe("1 / 3");
  });

  it("advances when the progress countdown ends", () => {
    const { container } = setup();
    fireEvent.animationEnd(container.querySelector("[data-banner-progress]"));
    expect(activeLabel(container)).toBe("2 / 3");
  });

  it("pauses the countdown while hovered and resumes on leave", () => {
    const { container } = setup();
    const region = container.querySelector('[aria-roledescription="carousel"]');
    const state = () => container.querySelector("[data-banner-progress]").style.animationPlayState;
    expect(state()).toBe("running");
    fireEvent.mouseEnter(region);
    expect(state()).toBe("paused");
    fireEvent.mouseLeave(region);
    expect(state()).toBe("running");
  });

  it("pauses during a touch and changes slide on a horizontal swipe", () => {
    const { container } = setup();
    const surface = container.querySelector('[aria-roledescription="carousel"] > div');
    const state = () => container.querySelector("[data-banner-progress]").style.animationPlayState;
    fireEvent.touchStart(surface, { touches: [{ clientX: 300, clientY: 100 }] });
    expect(state()).toBe("paused");
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 120, clientY: 104 }] });
    expect(activeLabel(container)).toBe("2 / 3");
    expect(state()).toBe("running");
  });

  it("ignores a mostly vertical drag (page scroll)", () => {
    const { container } = setup();
    const surface = container.querySelector('[aria-roledescription="carousel"] > div');
    fireEvent.touchStart(surface, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 140, clientY: 260 }] });
    expect(activeLabel(container)).toBe("1 / 3");
  });

  it("stops autoplay from the pause button", () => {
    const { container, getByLabelText } = setup();
    fireEvent.click(getByLabelText("Dừng tự chuyển banner"));
    const bar = container.querySelector("[data-banner-progress]");
    expect(bar.style.animationName).toBe("");
    fireEvent.animationEnd(bar);
    expect(activeLabel(container)).toBe("1 / 3");
    expect(getByLabelText("Tiếp tục tự chuyển banner")).toBeTruthy();
  });

  it("never autoplays under prefers-reduced-motion", () => {
    reducedMotion = true;
    const { container, queryByLabelText } = setup();
    expect(container.querySelector("[data-banner-progress]").style.animationName).toBe("");
    expect(queryByLabelText("Dừng tự chuyển banner")).toBeNull();
  });

  it("hides the controls when there is a single slide", () => {
    const { container, queryByLabelText } = setup({ slides: [SLIDES[0]] });
    expect(queryByLabelText("Banner tiếp theo")).toBeNull();
    expect(container.querySelector("[data-banner-progress]")).toBeNull();
  });
});

describe("homepage banner config", () => {
  const all = [...HERO_SLIDES, ...SIDE_BANNERS];

  it("has three carousel slides and two side banners", () => {
    expect(HERO_SLIDES).toHaveLength(3);
    expect(SIDE_BANNERS).toHaveLength(2);
  });

  it("gives every banner an image, alt text and a storefront link", () => {
    all.forEach((b) => {
      expect(b.src).toMatch(/^\/banners\/.+\.webp$/);
      expect(b.alt.length).toBeGreaterThan(0);
      expect(b.href).toMatch(/^\/(products|register|profile|news)/);
      if (b.memberHref) expect(b.memberHref).toMatch(/^\/profile/);
    });
  });

  it("keeps every banner at the shared ratio the layout is computed from", () => {
    all.forEach((b) => {
      expect(b.width).toBe(BANNER_WIDTH);
      expect(b.height).toBe(BANNER_HEIGHT);
    });
  });

  it("activeBanners drops campaigns outside their window", () => {
    const list = [
      { id: "always" },
      { id: "ended", activeUntil: "2026-10-20T23:59:59+07:00" },
      { id: "upcoming", activeFrom: "2026-11-01T00:00:00+07:00" },
    ];
    const ids = (now) => activeBanners(list, Date.parse(now)).map((b) => b.id);
    expect(ids("2026-10-15T12:00:00+07:00")).toEqual(["always", "ended"]);
    expect(ids("2026-10-21T00:00:00+07:00")).toEqual(["always"]);
    expect(ids("2026-11-02T00:00:00+07:00")).toEqual(["always", "upcoming"]);
  });

  it("bannerSrcSet offers the 960px copy and the original", () => {
    expect(bannerSrcSet(SLIDES[0])).toBe("/banners/a-960.webp 960w, /banners/a.webp 1983w");
    expect(bannerSrcSet({ src: "/x.webp", width: 100 })).toBeUndefined();
  });
});
