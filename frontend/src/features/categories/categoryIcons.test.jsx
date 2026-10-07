// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import CategoryIcon from "@/components/common/CategoryIcon";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  categoryIconByKey,
  categoryIconSrc,
  guessCategoryIcon,
  resolveCategoryIcon,
  toSlugText,
} from "@/features/categories/categoryIcons";

afterEach(cleanup);

describe("category icon registry", () => {
  it("has unique, slug-style keys", () => {
    const keys = CATEGORY_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Same shape the backend accepts for Category.icon.
    keys.forEach((k) => expect(k).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));
  });

  it("ships a scalable SVG for every icon key", () => {
    // Paths resolve from the frontend root, where vitest runs.
    CATEGORY_ICONS.forEach((icon) => {
      const file = `public${categoryIconSrc(icon)}`;
      expect(existsSync(file), file).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg.startsWith("<svg"), file).toBe(true);
      expect(svg, file).toContain("viewBox=");
      // A fixed 1em size would shrink the <img> to the text size.
      expect(svg, file).not.toMatch(/<svg[^>]*\swidth=/);
    });
  });

  it("strips Vietnamese diacritics into slug text", () => {
    expect(toSlugText("Sách giaó khoa")).toBe("sach-giao-khoa");
    expect(toSlugText("Tiểu sử - hồi ký")).toBe("tieu-su-hoi-ky");
    expect(toSlugText("  Đời sống  ")).toBe("doi-song");
  });

  it("guesses an icon for each of the shop's current categories", () => {
    const cases = {
      "kinh-te": "trending-up",
      "ky-nang-song": "sprout",
      "ngoai-ngu": "languages",
      "sach-giao-khoa": "graduation-cap",
      "sach-thieu-nhi": "smile",
      "tieu-su-hoi-ky": "user-round",
      "van-hoc": "feather",
    };
    Object.entries(cases).forEach(([slug, key]) =>
      expect(guessCategoryIcon(slug)?.key, slug).toBe(key)
    );
  });

  it("guesses from a Vietnamese name with diacritics", () => {
    expect(guessCategoryIcon("Nấu ăn ngon")?.key).toBe("chef-hat");
    expect(guessCategoryIcon("Tâm lý học")?.key).toBe("brain");
  });

  it("prefers the longer keyword and matches whole words only", () => {
    // "truyen-tranh" (comics) must win over looser literature matches.
    expect(guessCategoryIcon("Truyện tranh")?.key).toBe("sparkles");
    // "it" (IT) must not fire inside other words.
    expect(guessCategoryIcon("Tiểu thuyết")?.key).toBe("feather");
    expect(guessCategoryIcon("Bí kíp")).toBeNull();
  });

  it("returns null for empty or unknown input", () => {
    expect(guessCategoryIcon("")).toBeNull();
    expect(guessCategoryIcon(undefined, null)).toBeNull();
    expect(categoryIconByKey("")).toBeNull();
    expect(categoryIconByKey("no-such-icon")).toBeNull();
  });

  it("resolves: chosen key, then guess, then the default book", () => {
    expect(resolveCategoryIcon({ slug: "van-hoc", icon: "music" }).key).toBe("music");
    expect(resolveCategoryIcon({ slug: "van-hoc", icon: "" }).key).toBe("feather");
    // A key the frontend no longer knows falls back to the guess.
    expect(resolveCategoryIcon({ slug: "van-hoc", icon: "retired" }).key).toBe("feather");
    expect(resolveCategoryIcon({ name: "Bí kíp" })).toBe(DEFAULT_CATEGORY_ICON);
    expect(resolveCategoryIcon()).toBe(DEFAULT_CATEGORY_ICON);
  });
});

describe("CategoryIcon", () => {
  it("draws the resolved icon's artwork on a tile", () => {
    const { container } = render(<CategoryIcon category={{ slug: "van-hoc" }} />);
    const tile = container.firstChild;
    expect(tile.tagName).toBe("SPAN");
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(tile.querySelector("img").getAttribute("src")).toBe("/category-icons/feather.svg");
  });

  it("shows the category image instead, and falls back if it fails", () => {
    const { container } = render(
      <CategoryIcon category={{ slug: "van-hoc", image: "/c.jpg" }} />
    );
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toBe("/c.jpg");
    fireEvent.error(img);
    expect(container.querySelector("img").getAttribute("src")).toBe(
      "/category-icons/feather.svg"
    );
  });

  it("bare mode renders only the icon, ignoring the category image", () => {
    const { container } = render(
      <CategoryIcon category={{ slug: "kinh-te", image: "/c.jpg" }} bare />
    );
    expect(container.children).toHaveLength(1);
    expect(container.firstChild.tagName).toBe("IMG");
    expect(container.firstChild.getAttribute("src")).toBe("/category-icons/trending-up.svg");
  });
});
