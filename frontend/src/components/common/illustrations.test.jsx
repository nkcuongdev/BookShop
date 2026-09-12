// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import * as illustrations from "@/components/common/illustrations";

const ALL = Object.entries(illustrations).filter(([, v]) => typeof v === "function");

describe("illustrations", () => {
  it("exports the six states we need", () => {
    expect(ALL.map(([name]) => name).sort()).toEqual([
      "EmptyCartIllustration",
      "EmptyShelfIllustration",
      "ErrorIllustration",
      "NoResultsIllustration",
      "NoReviewsIllustration",
      "NotFoundIllustration",
    ]);
  });

  it.each(ALL)("%s renders an aria-hidden svg", (_name, Component) => {
    const { container } = render(<Component className="text-primary" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // decorative: the surrounding heading carries the meaning
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 160 120");
    // the caller's class must land on the svg so text-* drives currentColor
    expect(svg.getAttribute("class")).toContain("text-primary");
  });

  it.each(ALL)("%s uses currentColor, never a baked-in hex", (_name, Component) => {
    const { container } = render(<Component />);
    const markup = container.innerHTML;
    expect(markup).toContain("currentColor");
    // token classes are fine; literal hex is not — it would ignore the theme
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
