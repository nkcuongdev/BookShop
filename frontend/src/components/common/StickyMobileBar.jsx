import { cn } from "@/lib/utils";

/**
 * Fixed action bar shown below `lg`, for pages whose primary CTA would otherwise
 * scroll out of reach.
 *
 * Replaces two near-identical copies (BookDetail, Checkout) whose buttons had
 * drifted apart — different icon sizes (w-5 vs w-4) and different labels for the
 * same action ("Thêm vào giỏ" vs "Giỏ hàng").
 *
 * NOTE: the page must reserve space for this, e.g. `pb-28 lg:pb-0` on its root,
 * or the bar covers the last of the content.
 */
export default function StickyMobileBar({ children, className }) {
  return (
    <div
      className={cn(
        "glass-chrome fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border p-3 shadow-nav-up lg:hidden",
        // clears the iOS home indicator
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {children}
    </div>
  );
}
