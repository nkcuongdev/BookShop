import { Wand2 } from "lucide-react";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  categoryIconByKey,
  categoryIconSrc,
  guessCategoryIcon,
} from "@/features/categories/categoryIcons";
import { cn } from "@/lib/utils";

/**
 * Icon grid for the category form. `value` is the stored key; "" means
 * automatic — the storefront then guesses from the name and slug, and the
 * first tile previews that guess so the admin sees what customers will get.
 */
export function CategoryIconPicker({ value = "", onChange, name = "", slug = "" }) {
  const guessed = guessCategoryIcon(slug, name) || DEFAULT_CATEGORY_ICON;
  const selected = categoryIconByKey(value);
  const caption = selected
    ? `Đã chọn: ${selected.label}`
    : `Tự động theo tên: ${guessed.label}`;

  const tileClass = (active) =>
    cn(
      "relative flex size-10 items-center justify-center rounded-lg bg-primary-50/70 ring-1 transition-[box-shadow,transform] duration-fast ease-out-soft hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      active
        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
        : "ring-primary-100/70 hover:ring-primary-300"
    );

  return (
    <div>
      <div role="radiogroup" aria-label="Biểu tượng danh mục" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={!selected}
          aria-label={`Tự động (${guessed.label})`}
          title={`Tự động — ${guessed.label}`}
          onClick={() => onChange("")}
          className={tileClass(!selected)}
        >
          <img src={categoryIconSrc(guessed)} alt="" className="size-6" draggable={false} />
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-card text-primary shadow-xs ring-1 ring-border">
            <Wand2 className="size-2.5" />
          </span>
        </button>

        {CATEGORY_ICONS.map((icon) => {
          const active = selected?.key === icon.key;
          return (
            <button
              key={icon.key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={icon.label}
              title={icon.label}
              onClick={() => onChange(icon.key)}
              className={tileClass(active)}
            >
              <img
                src={categoryIconSrc(icon)}
                alt=""
                loading="lazy"
                className="size-6"
                draggable={false}
              />
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
