import { Crown, Gem, Medal } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Tier colours come from the intent tokens rather than literal hues, so the
// badge keeps its meaning if the palette is retuned.
const tierVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      tier: {
        silver: "bg-muted text-foreground ring-1 ring-border",
        gold: "bg-warning-muted text-warning-strong",
        diamond: "bg-info-muted text-info-strong",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: { tier: "silver", size: "md" },
  }
);

const TIER_ICONS = { silver: Medal, gold: Crown, diamond: Gem };

/**
 * Membership tier chip. Accepts either a tier object from the API or a bare key,
 * so callers holding only `user.loyalty.tierKey` do not have to look one up.
 */
export default function TierBadge({ tier, label, size = "md", className }) {
  const key = typeof tier === "string" ? tier : tier?.key;
  if (!key) return null;

  const Icon = TIER_ICONS[key] || Medal;
  const text = label || (typeof tier === "object" ? tier.label : "") || key;
  // An unrecognised key still renders, styled as the base tier rather than
  // vanishing: an admin who adds a fourth tier gets a plain chip, not nothing.
  const variant = TIER_ICONS[key] ? key : "silver";

  return (
    <span className={cn(tierVariants({ tier: variant, size }), className)}>
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      {text}
    </span>
  );
}
