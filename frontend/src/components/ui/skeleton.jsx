import { cn } from "@/lib/utils";

/**
 * Loading placeholder.
 *
 * `.skeleton` (index.css) draws a sweeping shimmer instead of the previous
 * `animate-pulse` opacity breathe, which read as "disabled" rather than
 * "loading". Same single-class API, so all 66 existing usages are unchanged.
 */
function Skeleton({ className, ...props }) {
  return <div className={cn("skeleton rounded-xl", className)} {...props} />;
}

export { Skeleton };
