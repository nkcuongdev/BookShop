import { cn } from "@/lib/utils";

/**
 * The BookShop logo, from the files in public/brand/.
 *
 * @param variant  "full" — mark + wordmark (960×187); "mark" — the lotus-book
 *                 symbol alone, square (256×256), for narrow or collapsed spots.
 * @param tone     "dark" — navy wordmark for light surfaces; "light" — white
 *                 wordmark for dark surfaces such as the footer. The mark keeps
 *                 its colours in both.
 *
 * Size it with a height class (e.g. `h-9`); width follows the image ratio.
 * The full logo is cropped to its visible shapes, with the top padded by half
 * the "p" descender so it sits optically centred when the box is centred.
 */
const SOURCES = {
  full: {
    dark: "/brand/bookshop-logo.webp",
    light: "/brand/bookshop-logo-light.webp",
    width: 960,
    height: 187,
  },
  mark: {
    dark: "/brand/bookshop-mark.webp",
    light: "/brand/bookshop-mark.webp",
    width: 256,
    height: 256,
  },
};

export default function BrandLogo({
  variant = "full",
  tone = "dark",
  alt = "BookShop",
  className,
}) {
  const source = SOURCES[variant] || SOURCES.full;
  return (
    <img
      src={source[tone] || source.dark}
      alt={alt}
      width={source.width}
      height={source.height}
      decoding="async"
      draggable={false}
      className={cn("block w-auto select-none", className)}
    />
  );
}
