import { cn } from "@/lib/utils";

export function PageHeader({ title, description, breadcrumb, actions, className }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {breadcrumb}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h1 font-display font-bold text-foreground tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
