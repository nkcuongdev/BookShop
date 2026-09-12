import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn — custom shadow tiers", () => {
  // tailwind-merge classifies an UNREGISTERED `shadow-*` as a shadow COLOR, which
  // does not conflict with shadow-lg. The failure is silent: both classes survive
  // and the cascade picks whichever came last in the stylesheet, so a tier that
  // should win quietly loses. Every name in tailwind.config.js boxShadow must be
  // registered in the `shadow` class group for these to pass.
  it("a later elevation tier overrides an earlier one", () => {
    expect(cn("shadow-rest", "shadow-lift")).toBe("shadow-lift");
    expect(cn("shadow-lift", "shadow-modal")).toBe("shadow-modal");
    expect(cn("shadow-xs", "shadow-float")).toBe("shadow-float");
  });

  it("custom tiers conflict with Tailwind's stock shadow scale", () => {
    expect(cn("shadow-lg", "shadow-rest")).toBe("shadow-rest");
    expect(cn("shadow-rest", "shadow-lg")).toBe("shadow-lg");
  });

  it("the primary glow is registered in both tiers", () => {
    expect(cn("shadow-rest", "shadow-primary-glow")).toBe("shadow-primary-glow");
    expect(cn("shadow-primary-glow", "shadow-primary-glow-lg")).toBe(
      "shadow-primary-glow-lg"
    );
    expect(cn("shadow-primary-glow-lg", "shadow-modal")).toBe("shadow-modal");
  });

  it("nav-up is registered", () => {
    expect(cn("shadow-rest", "shadow-nav-up")).toBe("shadow-nav-up");
  });

  it("hover: variants are merged independently of the base shadow", () => {
    expect(cn("shadow-primary-glow", "hover:shadow-primary-glow-lg")).toBe(
      "shadow-primary-glow hover:shadow-primary-glow-lg"
    );
  });
});
