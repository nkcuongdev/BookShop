import { Link } from "react-router-dom";

export default function EmptyState({
  title = "Không tìm thấy sản phẩm",
  description = "Thử thay đổi bộ lọc hoặc tìm kiếm với từ khóa khác.",
  actionLabel = "Xem tất cả sách",
  actionLink = "/products",
}) {
  return (
    <div className="text-center py-16">
      <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
        <svg
          className="w-12 h-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-secondary-800 mb-2">{title}</h2>
      <p className="text-secondary-500 mb-6 max-w-sm mx-auto">{description}</p>
      <Link
        to={actionLink}
        className="inline-flex items-center gap-2 bg-primary-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-600 transition-all duration-200 shadow-lg shadow-primary-500/25"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
