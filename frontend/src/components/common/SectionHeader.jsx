import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Section title row: marker + title + optional subtitle + right-aligned action.
 *
 * Absorbs five hand-rolled spellings that expressed the same idea differently —
 * an accent bar at h-7 in one place and h-8 in another, a subtitle offset by
 * ml-3.5 in one and nested in another, plus an icon-tile variant repeated
 * verbatim four times inside Checkout alone.
 *
 * @param variant  accent (vertical bar) | icon (tile) | plain
 * @param icon     lucide component, required by variant="icon"
 * @param size     md (card/section) | lg (page section)
 */
const markerVariants = cva("shrink-0 rounded-full bg-primary", {
  variants: {
    size: { md: "h-7 w-1", lg: "h-8 w-1" },
  },
  defaultVariants: { size: "md" },
});

const titleVariants = cva("font-display font-bold text-foreground", {
  variants: {
    size: { md: "text-h3", lg: "text-h3 lg:text-h2" },
  },
  defaultVariants: { size: "md" },
});

export default function SectionHeader({
  title,
  subtitle,
  action,
  icon: Icon,
  variant = "accent",
  size = "md",
  className,
  titleAs: TitleTag = "h2",
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-end justify-between gap-4",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {variant === "accent" && <div className={markerVariants({ size })} />}
        {variant === "icon" && Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <TitleTag className={titleVariants({ size })}>{title}</TitleTag>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
