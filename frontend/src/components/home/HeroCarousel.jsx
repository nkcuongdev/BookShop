import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import BannerImage from "@/components/home/BannerImage";
import { HERO_INTERVAL_MS, HERO_SLIDES } from "@/features/home/banners";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 45;
// Rendered width of the carousel: full width below lg, ~2/3 of the 1280px
// container above it. Lets the browser pick the 960px file on phones.
const SLIDE_SIZES = "(min-width: 1024px) 820px, 100vw";

function usePageHidden() {
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden
  );
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}

// Always shown on tablets (no hover there); on desktop they fade in when the
// pointer is over the banner, so they don't sit on the artwork at rest.
const arrowClass =
  "absolute top-1/2 z-20 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-foreground shadow-lift ring-1 ring-foreground/5 backdrop-blur transition-[opacity,background-color,color] duration-base ease-out-soft hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid lg:size-10 lg:opacity-0 lg:group-hover/banner:opacity-100 lg:focus-visible:opacity-100";

/**
 * Main homepage carousel of banner artworks.
 *
 * Each slide is one finished image linked to its page; nothing is drawn over
 * the artwork except the navigation, and on phones the dots sit below the
 * image so they never cover its copy.
 *
 * Autoplay is driven by the active dot's progress animation (`banner-progress`
 * in index.css): the slide advances on `animationend`, so pausing is just
 * pausing that animation. It pauses on hover, keyboard focus, touch and while
 * the tab is hidden, and stays off for prefers-reduced-motion or after the
 * visitor presses the pause button.
 */
export default function HeroCarousel({
  slides = HERO_SLIDES,
  interval = HERO_INTERVAL_MS,
  className,
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [stopped, setStopped] = useState(false);
  const pageHidden = usePageHidden();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const touchStart = useRef(null);

  const autoplay = count > 1 && !reducedMotion && !stopped;
  const running = autoplay && !hovered && !focused && !touching && !pageHidden;

  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + count) % count),
    [count]
  );

  if (!count) return null;

  const handleFocus = (event) => {
    // Pause for keyboard focus only. A mouse click also focuses what it hit,
    // and pausing on that would leave autoplay stuck after one arrow click.
    let keyboard = true;
    try {
      keyboard = event.target.matches(":focus-visible");
    } catch {
      // Engines without :focus-visible — treat any focus as keyboard focus.
    }
    if (keyboard) setFocused(true);
  };

  const handleBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    }
  };

  const handleTouchStart = (event) => {
    const t = event.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    setTouching(true);
  };

  const handleTouchEnd = (event) => {
    const start = touchStart.current;
    touchStart.current = null;
    setTouching(false);
    const t = event.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next();
    else prev();
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Chương trình nổi bật"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn("group/banner relative", className)}
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
          setTouching(false);
        }}
        className="relative isolate aspect-[1983/793] overflow-hidden bg-primary-50 shadow-rest ring-1 ring-foreground/[0.06] sm:rounded-lg"
      >
        {/* All slides share one grid cell so they crossfade in place. */}
        <div className="grid h-full [&>*]:col-start-1 [&>*]:row-start-1">
          {slides.map((slide, i) => {
            const active = i === index;
            return (
              <div
                key={slide.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${count}`}
                aria-hidden={!active}
                // Hidden slides stay mounted for the crossfade; `inert` keeps
                // their links out of the tab order and away from screen readers.
                inert={active ? undefined : ""}
                data-active={active || undefined}
                className={cn(
                  "h-full overflow-hidden transition-opacity duration-700 ease-out-soft",
                  active ? "z-10 opacity-100" : "pointer-events-none opacity-0"
                )}
              >
                <Link
                  to={slide.href}
                  draggable={false}
                  // The focus ring is an ::after layer so the image cannot
                  // paint over it.
                  className="relative block h-full after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-inset after:ring-primary focus-visible:outline-none focus-visible:after:ring-[3px]"
                >
                  <BannerImage
                    banner={slide}
                    sizes={SLIDE_SIZES}
                    priority={i === 0}
                    className={cn(
                      "transition-transform duration-[1200ms] ease-out-soft motion-reduce:transition-none",
                      active ? "scale-100" : "scale-[1.04]"
                    )}
                  />
                </Link>
              </div>
            );
          })}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Banner trước"
              className={cn(arrowClass, "left-2 lg:left-3")}
            >
              <ChevronLeft className="size-4 lg:size-5" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Banner tiếp theo"
              className={cn(arrowClass, "right-2 lg:right-3")}
            >
              <ChevronRight className="size-4 lg:size-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <>
          {/* Below the image on phones; a frosted pill over its bottom edge
              from sm up. */}
          <div className="mt-2 flex justify-center sm:absolute sm:inset-x-0 sm:bottom-3 sm:z-20 sm:mt-0">
            <div className="flex items-center gap-0.5 rounded-full px-1.5 sm:bg-black/25 sm:backdrop-blur-md">
              {slides.map((slide, i) => {
                const isActive = i === index;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Xem banner ${i + 1}`}
                    aria-current={isActive ? "true" : undefined}
                    className="group/dot flex h-6 items-center px-1 focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        "relative block h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-slow ease-out-soft group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-primary group-focus-visible/dot:ring-offset-1",
                        isActive
                          ? "w-7 bg-foreground/15 sm:bg-white/35"
                          : "w-1.5 bg-foreground/25 group-hover/dot:bg-foreground/45 sm:bg-white/60 sm:group-hover/dot:bg-white"
                      )}
                    >
                      {isActive && (
                        <span
                          // Remounts per slide so the countdown restarts.
                          key={autoplay ? `run-${index}` : "static"}
                          data-banner-progress
                          onAnimationEnd={autoplay ? next : undefined}
                          className="absolute inset-0 origin-left rounded-full bg-primary sm:bg-white"
                          style={
                            autoplay
                              ? {
                                  animation: `banner-progress ${interval}ms linear forwards`,
                                  animationPlayState: running ? "running" : "paused",
                                }
                              : undefined
                          }
                        />
                      )}
                    </span>
                  </button>
                );
              })}

              {!reducedMotion && (
                <button
                  type="button"
                  onClick={() => setStopped((s) => !s)}
                  aria-label={stopped ? "Tiếp tục tự chuyển banner" : "Dừng tự chuyển banner"}
                  className="ml-0.5 grid size-6 place-items-center rounded-full text-foreground/60 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-white/80 sm:hover:text-white"
                >
                  {stopped ? <Play className="size-3" /> : <Pause className="size-3" />}
                </button>
              )}
            </div>
          </div>

          <p aria-live={running ? "off" : "polite"} className="sr-only">
            {`Banner ${index + 1} / ${count}: ${slides[index].alt}`}
          </p>
        </>
      )}
    </section>
  );
}
