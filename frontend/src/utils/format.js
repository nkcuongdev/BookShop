// Format price to VNĐ (price is already in VNĐ)
export const formatVND = (price) => {
  if (!price && price !== 0) return "0đ";
  return new Intl.NumberFormat("vi-VN").format(price) + "đ";
};

// Format date to Vietnamese format
export const formatDateVN = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};
