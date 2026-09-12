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
    <section className={cn("rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-rest", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            {Icon && (
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                <Icon className="size-4" />
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
              )}
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
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
