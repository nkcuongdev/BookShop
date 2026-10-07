import { useState } from "react";
import HeroCarousel from "@/components/home/HeroCarousel";
import PromoBanner from "@/components/home/PromoBanner";
import { HERO_SLIDES, SIDE_BANNERS, activeBanners } from "@/features/home/banners";
import { cn } from "@/lib/utils";

/**
 * Top-of-page banner cluster: the carousel on the left, two fixed banners
 * stacked on the right. Content lives in features/home/banners.js.
 *
 * Every banner keeps its artwork's own ratio (r = 1983/793), so nothing is
 * cropped or letterboxed. For the right column's two stacked banners to end
 * exactly where the carousel ends, the columns cannot be a simple 2fr/1fr:
 *
 *   carousel height  H = L / r
 *   banner height    h = (H − g) / 2,  banner width R = r·h = (L − r·g) / 2
 *   with L + g + R = total width T  →  R = (T − g) / 3 − r·g / 3
 *
 * With g = 1rem (lg:gap-4) that is `calc((100% − 1rem) / 3 − 13.34px)`.
 * Change the gap or the artwork ratio and this column must change with it.
 *
 * Below lg the carousel spans the full width (edge to edge on phones, where
 * every pixel of width makes the printed copy larger); the two banners sit
 * side by side on tablets and in a swipeable row on phones, each wide enough
 * to keep its text legible.
 */
export default function HomeBanners() {
  // Evaluated once per visit: a campaign ending mid-session stays until reload.
  const [slides] = useState(() => activeBanners(HERO_SLIDES));
  const [sideBanners] = useState(() => activeBanners(SIDE_BANNERS));
  const hasCarousel = slides.length > 0;

  return (
    <section aria-labelledby="home-title" className="page-container sm:pt-5 lg:pt-6">
      <h1 id="home-title" className="sr-only">
        BookShop — Nhà sách trực tuyến
      </h1>

      <div
        className={cn(
          "grid gap-3 sm:gap-4",
          hasCarousel &&
            "lg:grid-cols-[minmax(0,1fr)_calc((100%_-_1rem)/3_-_13.34px)] lg:items-start"
        )}
      >
        {hasCarousel && <HeroCarousel slides={slides} className="-mx-4 sm:mx-0" />}

        {sideBanners.length > 0 && (
          <div
            className={cn(
              "no-scrollbar -mx-4 -my-1 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-1",
              "sm:mx-0 sm:my-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:py-0",
              hasCarousel && "lg:grid-cols-1"
            )}
          >
            {sideBanners.map((banner) => (
              <PromoBanner
                key={banner.id}
                banner={banner}
                className={cn(
                  "shrink-0 snap-start sm:w-auto",
                  sideBanners.length > 1 ? "w-[86%]" : "w-full"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
