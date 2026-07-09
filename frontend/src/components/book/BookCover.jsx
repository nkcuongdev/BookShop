import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The single way to render a book cover.
 *
 * Consolidates ten divergent treatments: six different aspect ratios (including
 * a 1:1 square that cropped covers), five radii for the same thumbnail size, and
 * four fallback strategies — two of which pointed at via.placeholder.com, a
 * domain offline since 2024, so those rendered as broken images.
 *
 * Always 3:4. The wrapper owns the ratio and the image fills it, so adding
 * width/height cannot introduce layout shift.
 */
const coverVariants = cva(
  "relative overflow-hidden",
  {
    variants: {
      // The placeholder shows through until the image decodes, and on a CSP-
      // blocked or still-loading src it is ALL you see. `bg-muted` is a light
      // zinc built for white cards; on the hero's indigo it reads as a blank
      // white rectangle, so dark surfaces get their own placeholder.
      onDark: {
        true: "bg-primary-800",
        false: "bg-muted",
      },
      size: {
        xs: "w-9 rounded-md", //  36px — avatar stacks, dense admin rows
        sm: "w-12 rounded-lg", //  48px — line items, search suggestions
        md: "w-16 rounded-xl", //  64px — order items
        lg: "w-24 rounded-2xl", //  96px — cart rows
        full: "w-full rounded-3xl", // fills its grid cell — cards, detail page
      },
      ratio: {
        // 3:4 is the real ratio of a book cover. `free` is an escape hatch for
        // article thumbnails, which are 16:9 and not books at all.
        cover: "aspect-[3/4]",
        free: "",
      },
    },
    defaultVariants: { size: "md", ratio: "cover", onDark: false },
  }
);

/** Deterministic tint per title so covers in a list don't all look identical. */
const TINTS = [
  "from-primary-100 to-primary-200 text-primary-400",
  "from-info-muted to-primary-100 text-info-strong/60",
  "from-brand-muted to-warning-muted text-brand-strong/60",
  "from-success-muted to-info-muted text-success-strong/60",
];

/**
 * Same tiles for dark surfaces. The light ramp above is built for a white card;
 * on the hero's indigo gradient those pale tints wash out to near-invisible
 * ghosts. These keep the per-title variation but invert the value relationship.
 */
const TINTS_ON_DARK = [
  "from-primary-700 to-primary-900 text-primary-200",
  "from-primary-600 to-primary-800 text-primary-100",
  "from-brand-strong to-primary-800 text-brand-muted",
  "from-info-strong to-primary-900 text-info-muted",
];

function tintFor(title = "", onDark = false) {
  // FNV-1a: distributes short strings well, where a plain h*31 accumulator
  // leaves single-character titles clustered.
  let h = 2166136261;
  for (let i = 0; i < title.length; i += 1) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const palette = onDark ? TINTS_ON_DARK : TINTS;
  return palette[Math.abs(h) % palette.length];
}

/**
 * @param src        cover URL; falls back to the initial tile when missing
 * @param title      used for alt text and the fallback initial
 * @param size       xs | sm | md | lg | full
 * @param ratio      cover (3:4) | free
 * @param zoomOnHover scale the image when an ancestor `.group` is hovered
 * @param priority   eager-load + high fetch priority (above-the-fold hero only)
 * @param onDark     pick the dark-surface fallback palette (hero gradient)
 */
export const BookCover = React.forwardRef(
  (
    {
      src,
      title = "",
      size,
      ratio,
      zoomOnHover = false,
      priority = false,
      onDark = false,
      className,
      imgClassName,
      children,
      ...props
    },
    ref
  ) => {
    const [failed, setFailed] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);
    const showFallback = !src || failed;

    // Reset when the URL changes — otherwise a previously failed cover keeps
    // showing the fallback after the book prop is swapped.
    React.useEffect(() => {
      setFailed(false);
      setLoaded(false);
    }, [src]);

    return (
      <div
        ref={ref}
        className={cn(coverVariants({ size, ratio, onDark }), className)}
        {...props}
      >
        {showFallback ? (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-gradient-to-br",
              tintFor(title, onDark)
            )}
          >
            <span className="font-display text-[1.5em] font-bold leading-none">
              {title?.trim()?.[0]?.toUpperCase() || "B"}
            </span>
          </div>
        ) : (
          <img
            src={src}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchpriority={priority ? "high" : undefined}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-slow ease-out-soft",
              loaded ? "opacity-100" : "opacity-0",
              zoomOnHover &&
                "transition-[opacity,transform] group-hover:scale-105",
              imgClassName
            )}
          />
        )}
        {children}
      </div>
    );
  }
);
BookCover.displayName = "BookCover";

export default BookCover;
