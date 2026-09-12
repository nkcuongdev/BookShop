import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import useDocumentMetadata from "@/hooks/useDocumentMetadata";

const DEFAULT_META = {
  title: "BookShop | Nhà sách trực tuyến",
  description: "Mua sách trực tuyến chính hãng, khám phá sách mới, sách bán chạy và nhiều ưu đãi tại BookShop.",
};

const ROUTES = {
  "/": DEFAULT_META,
  "/products": {
    title: "Tất cả sách | BookShop",
    description: "Tìm kiếm và khám phá danh mục sách đa dạng tại BookShop.",
  },
  "/news": {
    title: "Tin tức và bài viết về sách | BookShop",
    description: "Đọc tin tức, gợi ý đọc sách và kiến thức hữu ích từ BookShop.",
  },
  "/terms": { title: "Điều khoản sử dụng | BookShop", description: "Điều khoản sử dụng dịch vụ BookShop." },
  "/privacy": { title: "Chính sách bảo mật | BookShop", description: "Chính sách bảo mật và xử lý dữ liệu tại BookShop." },
  "/support/shipping": { title: "Chính sách vận chuyển | BookShop", description: "Thông tin giao hàng và vận chuyển đơn sách." },
  "/support/returns": { title: "Đổi trả và hoàn tiền | BookShop", description: "Điều kiện đổi trả và hoàn tiền tại BookShop." },
  "/support/faq": { title: "Câu hỏi thường gặp | BookShop", description: "Giải đáp nhanh các câu hỏi thường gặp khi mua sách." },
  "/support/contact": { title: "Liên hệ hỗ trợ | BookShop", description: "Các kênh liên hệ và hỗ trợ khách hàng BookShop." },
};

export default function RouteMetadata() {
  const { pathname } = useLocation();
  const metadata = useMemo(() => {
    if (ROUTES[pathname]) return ROUTES[pathname];
    if (pathname.startsWith("/books/")) {
      return { title: "Chi tiết sách | BookShop", description: DEFAULT_META.description };
    }
    if (pathname.startsWith("/news/")) {
      return { title: "Bài viết | BookShop", description: ROUTES["/news"].description };
    }
    if (["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"].includes(pathname)) {
      return { title: "Tài khoản | BookShop", description: DEFAULT_META.description, robots: "noindex,nofollow" };
    }
    if (pathname.startsWith("/cart") || pathname.startsWith("/checkout") || pathname.startsWith("/payment-result") || pathname.startsWith("/profile")) {
      return { title: "BookShop", description: DEFAULT_META.description, robots: "noindex,nofollow" };
    }
    return { title: "Không tìm thấy trang | BookShop", description: DEFAULT_META.description, robots: "noindex,follow" };
  }, [pathname]);

  useDocumentMetadata({ ...metadata, canonicalPath: pathname });
  return null;
}
