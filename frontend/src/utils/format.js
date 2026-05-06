// Format price to VNĐ (price is already in VNĐ)
export const formatVND = (price) => {
  if (!price && price !== 0) return "0đ";
  return new Intl.NumberFormat("vi-VN").format(price) + "đ";
};

// Derive discount data from book (supports optional originalPrice/discountPercent fields)
export const getPriceInfo = (book) => {
  if (!book) return { price: 0, originalPrice: null, discountPercent: 0 };
  const price = book.price || 0;
  let originalPrice = book.originalPrice || null;
  if (!originalPrice && book.discountPercent && book.discountPercent > 0) {
    originalPrice = Math.round(price / (1 - book.discountPercent / 100));
  }
  const discountPercent =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;
  return { price, originalPrice, discountPercent };
};

// Format compact numbers (1.2k, 10k+)
export const formatCompact = (n) => {
  if (!n && n !== 0) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
};

// Format date to Vietnamese format (dd/MM/yyyy)
export const formatDateVN = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

// Format date-time to Vietnamese format (HH:mm, dd/MM/yyyy)
export const formatDateTimeVN = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// Normalize display of order code across UI.
// Preferred format is backend-generated `OD-<timestamp36>-<random4>`.
export const formatOrderCode = (order) => {
  const explicitCode = order?.orderCode;
  if (typeof explicitCode === "string" && explicitCode.trim()) {
    return explicitCode.trim().toUpperCase();
  }

  const rawId = String(order?._id || order?.id || "").trim();
  if (!rawId) return "OD-UNKNOWN";

  return `OD-${rawId.slice(-8).toUpperCase()}`;
};

// Format relative date (e.g., "2 ngày trước", "1 tuần trước")
export const formatRelativeDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  if (diffWeek < 4) return `${diffWeek} tuần trước`;
  if (diffMonth < 12) return `${diffMonth} tháng trước`;
  return formatDateVN(dateString);
};

// Format date to readable format (e.g., "27 tháng 4, 2026")
export const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
