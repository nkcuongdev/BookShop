import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

/**
 * The storefront page-header band.
 *
 * Replaces four hand-rolled copies (ProductList, Cart, Checkout, BookDetail)
 * that differed only in incidental spacing — mb-2 vs mb-3, mt-0.5 vs mt-1 — and
 * whose padding had drifted to py-4 / py-5 / py-5 / py-6.
 *
 * @param crumbs   [{ label, to }] — the last entry renders as the current page
 * @param title    omit for a breadcrumb-only band (BookDetail does this)
 * @param subtitle line under the title
 * @param actions  right-aligned node, e.g. a button
 * @param children rendered below the title block (Checkout puts its stepper here)
 */
export default function PageHeader({
  crumbs = [],
  title,
  subtitle,
  actions,
  children,
  className,
}) {
  return (
    <div className={cn("border-b border-border bg-card", className)}>
      <div className="page-container py-6">
        {crumbs.length > 0 && (
          <Breadcrumb className="mb-3">
            <BreadcrumbList>
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <div key={crumb.label} className="flex items-center gap-1.5">
                    <BreadcrumbItem>
                      {isLast || !crumb.to ? (
                        <BreadcrumbPage
                          className={cn(crumb.truncate && "max-w-[220px] truncate")}
                        >
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link to={crumb.to}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </div>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        {(title || actions) && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              {title && (
                <h1 className="text-h2 font-display font-bold text-foreground lg:text-h1">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
