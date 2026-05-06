import { Link, useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CategoryPills({ categories = [], className }) {
  const [searchParams] = useSearchParams();
  const active = searchParams.get("category");

  if (!categories.length) return null;

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1",
        className
      )}
    >
      <Link
        to="/products"
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all",
          !active
            ? "bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/25"
            : "bg-white text-secondary-700 border-gray-200 hover:border-primary-300 hover:text-primary-600"
        )}
      >
        <BookOpen className="w-3.5 h-3.5" />
        Tất cả
      </Link>
      {categories.map((cat) => {
        const slug = cat.slug || cat._id || cat.id;
        const isActive = active === slug;
        return (
          <Link
            key={slug}
            to={`/products?category=${slug}`}
            className={cn(
              "shrink-0 inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border transition-all",
              isActive
                ? "bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/25"
                : "bg-white text-secondary-700 border-gray-200 hover:border-primary-300 hover:text-primary-600"
            )}
          >
            {cat.name}
          </Link>
        );
      })}
    </div>
  );
}
