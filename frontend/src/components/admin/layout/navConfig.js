import {
  LayoutDashboard,
  BookOpen,
  FolderTree,
  ShoppingCart,
  Users,
  Ticket,
  Tag,
  MessageSquare,
  FileText,
  Newspaper,
} from "lucide-react";

export const ADMIN_NAV = [
  {
    group: "Tổng quan",
    items: [
      { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
    ],
  },
  {
    group: "Catalog",
    items: [
      { to: "/admin/books", icon: BookOpen, label: "Sách" },
      { to: "/admin/categories", icon: FolderTree, label: "Danh mục" },
    ],
  },
  {
    group: "Bán hàng",
    items: [
      { to: "/admin/orders", icon: ShoppingCart, label: "Đơn hàng" },
      { to: "/admin/vouchers", icon: Ticket, label: "Voucher" },
      { to: "/admin/promotions", icon: Tag, label: "Khuyến mãi" },
    ],
  },
  {
    group: "Nội dung",
    items: [
      { to: "/admin/posts", icon: Newspaper, label: "Bài viết" },
      { to: "/admin/posts/categories", icon: FileText, label: "Danh mục bài viết" },
    ],
  },
  {
    group: "Khách hàng",
    items: [
      { to: "/admin/users", icon: Users, label: "Người dùng" },
      { to: "/admin/chat", icon: MessageSquare, label: "Chat hỗ trợ" },
    ],
  },
];

export function findActiveLabel(pathname) {
  for (const g of ADMIN_NAV) {
    for (const item of g.items) {
      if (item.end ? pathname === item.to : pathname.startsWith(item.to)) {
        return item.label;
      }
    }
  }
  return "Admin";
}
