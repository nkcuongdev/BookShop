import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}) {
  return (
    <section className={cn("rounded-2xl border border-gray-100 bg-white shadow-sm", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            {Icon && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div>
              {title && (
                <h3 className="font-semibold text-secondary-900">{title}</h3>
              )}
              {description && (
                <p className="text-xs text-secondary-500">{description}</p>
              )}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
