import { PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Customer-facing empty state.
 *
 * Not the same component as admin/common/EmptyState.jsx, which is a compact tile
 * for data tables. Kept separate on purpose — different designs.
 *
 * @param illustration a component from common/illustrations.jsx. Preferred over
 *                     `icon`: an icon in a box reads as "a control is missing",
 *                     an illustration reads as "there is nothing here yet".
 * @param icon         lucide fallback, kept so the ~23 existing call sites that
 *                     pass an icon keep working unchanged.
 */
export default function EmptyState({
  illustration: Illustration,
  icon: Icon = PackageOpen,
  title = "Không có dữ liệu",
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 py-16 text-center",
        // Entrance is deliberately gentle: an empty state usually appears right
        // after a load, so anything faster reads as a flicker.
        "animate-in fade-in slide-in-from-bottom-2 duration-slow ease-out-soft",
        className
      )}
    >
      {Illustration ? (
        <Illustration className="mb-6 h-28 w-36 text-primary" />
      ) : (
        <div className="mb-5 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100">
          <Icon className="size-10 text-primary" />
        </div>
      )}
      <h3 className="text-h3 font-display font-semibold text-foreground">
        {title}
      </h3>
      {description && (
        <p className="mt-2 max-w-md text-base text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
