import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { ADMIN_NAV, findActiveLabel } from "./navConfig";

const LABELS = Object.fromEntries(
  ADMIN_NAV.flatMap((g) => g.items.map((i) => [i.to, i.label]))
);

export function AdminBreadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = [];
  let acc = "";
  for (const s of segments) {
    acc += "/" + s;
    crumbs.push({ to: acc, label: LABELS[acc] || decodeURIComponent(s) });
  }

  return (
    <nav className="flex items-center gap-1 text-xs text-secondary-500">
      <Link to="/admin" className="flex items-center gap-1 hover:text-secondary-800">
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.slice(1).map((c, i) => (
        <span key={c.to} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {i === crumbs.length - 2 ? (
            <span className="font-medium text-secondary-800">{c.label}</span>
          ) : (
            <Link to={c.to} className="hover:text-secondary-800 capitalize">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export { findActiveLabel };
