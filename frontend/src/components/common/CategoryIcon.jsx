import { useState } from "react";
import { categoryIconSrc, resolveCategoryIcon } from "@/features/categories/categoryIcons";
import { cn } from "@/lib/utils";

const TILE_SIZES = {
  sm: { tile: "size-7 rounded-md", glyph: "size-[18px]" },
  md: { tile: "size-9 rounded-lg", glyph: "size-[22px]" },
  lg: { tile: "size-10 rounded-lg", glyph: "size-6" },
};

/**
 * A category's visual: its uploaded image if it has one, otherwise its icon
 * (chosen in the admin, or guessed from the name) on a soft tile.
 *
 * The icons are full-colour emoji artwork, so the tile stays one quiet tint
 * for every category and lets the artwork carry the colour.
 *
 * @param bare  render only the icon, no tile and no category image — for
 *              inline use such as the category pills.
 */
export default function CategoryIcon({ category, size = "md", bare = false, className }) {
  const [imageFailed, setImageFailed] = useState(false);
  const icon = resolveCategoryIcon(category);
  const glyph = (
    <img
      src={categoryIconSrc(icon)}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("shrink-0 select-none", bare ? "size-4" : (TILE_SIZES[size] || TILE_SIZES.md).glyph, bare && className)}
    />
  );

  if (bare) return glyph;

  const s = TILE_SIZES[size] || TILE_SIZES.md;

  if (category?.image && !imageFailed) {
    return (
      <img
        src={category.image}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
        className={cn("shrink-0 bg-muted object-cover", s.tile, className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary-50/70 ring-1 ring-inset ring-primary-100/70",
        s.tile,
        className
      )}
    >
      {glyph}
    </span>
  );
}
