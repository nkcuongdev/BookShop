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
  Mail,
  Headphones,
  Truck,
  PackagePlus,
  PackageMinus,
  ClipboardCheck,
  History,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Star,
  ScrollText,
  Sparkles,
  Gift,
  Settings2,
} from "lucide-react";
import { can } from "@/lib/rbac";

/**
 * Admin navigation. Every item carries the permission its page requires, and
 * the same value gates the route in App.jsx — keep the two in step.
 */
export const ADMIN_NAV = [
  {
    group: "Tổng quan",
    items: [
      {
        to: "/admin",
        icon: LayoutDashboard,
        label: "Dashboard",
        end: true,
        permission: "dashboard.view",
      },
      {
        to: "/admin/reports/profit",
        icon: TrendingUp,
        label: "Lợi nhuận",
        permission: "analytics.view",
      },
    ],
  },
  {
    group: "Catalog",
    items: [
      { to: "/admin/books", icon: BookOpen, label: "Sách", permission: "book.read" },
      {
        to: "/admin/categories",
        icon: FolderTree,
        label: "Danh mục",
        permission: "category.manage",
      },
      {
        to: "/admin/reviews",
        icon: Star,
        label: "Đánh giá",
        permission: "review.moderate",
      },
    ],
  },
  {
    group: "Bán hàng",
    items: [
      {
        to: "/admin/orders",
        icon: ShoppingCart,
        label: "Đơn hàng",
        permission: "order.read",
      },
      {
        to: "/admin/vouchers",
        icon: Ticket,
        label: "Voucher",
        permission: "voucher.manage",
      },
      {
        to: "/admin/promotions",
        icon: Tag,
        label: "Khuyến mãi",
        permission: "promotion.manage",
      },
    ],
  },
  {
    group: "Kho hàng",
    items: [
      {
        to: "/admin/suppliers",
        icon: Truck,
        label: "Nhà cung cấp",
        permission: "supplier.read",
      },
      {
        to: "/admin/inventory/receipts",
        icon: PackagePlus,
        label: "Phiếu nhập",
        permission: "inventory.read",
      },
      {
        to: "/admin/inventory/issues",
        icon: PackageMinus,
        label: "Phiếu xuất",
        permission: "inventory.read",
      },
      {
        to: "/admin/inventory/counts",
        icon: ClipboardCheck,
        label: "Kiểm kho",
        permission: "inventory.read",
      },
      {
        to: "/admin/inventory/ledger",
        icon: History,
        label: "Lịch sử tồn",
        permission: "inventory.read",
      },
      {
        to: "/admin/inventory/low-stock",
        icon: AlertTriangle,
        label: "Sắp hết hàng",
        permission: "inventory.read",
        // Rendered as a count chip by the sidebar; see AdminSidebar.
        badge: "lowStock",
      },
    ],
  },
  {
    group: "Nội dung",
    items: [
      {
        to: "/admin/posts",
        icon: Newspaper,
        label: "Bài viết",
        // posts/new and posts/:id/edit belong to this row; posts/categories
        // is its own nav entry and must not light this one up too.
        except: ["/admin/posts/categories"],
        permission: "post.read",
      },
      {
        to: "/admin/posts/categories",
        icon: FileText,
        label: "Danh mục bài viết",
        permission: "postCategory.manage",
      },
      {
        to: "/admin/newsletter",
        icon: Mail,
        label: "Newsletter",
        permission: "newsletter.manage",
      },
    ],
  },
  {
    group: "Khách hàng",
    items: [
      {
        to: "/admin/users",
        icon: Users,
        label: "Người dùng",
        permission: "user.manage",
      },
      {
        to: "/admin/loyalty/members",
        icon: Sparkles,
        label: "Điểm & hạng",
        permission: "loyalty.read",
      },
      {
        to: "/admin/loyalty/rewards",
        icon: Gift,
        label: "Danh mục quà",
        permission: "loyalty.read",
      },
      {
        to: "/admin/loyalty/settings",
        icon: Settings2,
        label: "Cấu hình điểm",
        permission: "loyalty.read",
      },
    ],
  },
  {
    group: "Hỗ trợ",
    items: [
      {
        to: "/admin/chat",
        icon: MessageSquare,
        label: "Chat hỗ trợ",
        permission: "chat.read",
      },
      {
        to: "/admin/support",
        icon: Headphones,
        label: "Ticket hỗ trợ",
        permission: "ticket.read",
      },
    ],
  },
  {
    group: "Hệ thống",
    items: [
      {
        to: "/admin/roles",
        icon: ShieldCheck,
        label: "Vai trò & quyền",
        permission: "role.read",
      },
      {
        to: "/admin/audit-logs",
        icon: ScrollText,
        label: "Nhật ký quản trị",
        permission: "audit.read",
      },
    ],
  },
];

/**
 * The nav a given user may see. Every consumer that renders or navigates by
 * these entries must go through this, not ADMIN_NAV — the command palette
 * included, since it jumps straight to `to`.
 */
export function visibleNav(user) {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(user, item.permission)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Whether a nav item owns the given path. Prefix items may disown nested
 * siblings that are nav entries in their own right, via `except`.
 */
export function itemMatches(item, pathname) {
  if (item.end) return pathname === item.to;
  if (!pathname.startsWith(item.to)) return false;
  return !(item.except || []).some(
    (ex) => pathname === ex || pathname.startsWith(ex + "/")
  );
}

export function findActiveLabel(pathname) {
  // Longest match wins, so a nested path is labelled by its own entry rather
  // than by whichever prefix happens to come first.
  let best = null;
  for (const g of ADMIN_NAV) {
    for (const item of g.items) {
      if (itemMatches(item, pathname) && (!best || item.to.length > best.to.length)) {
        best = item;
      }
    }
  }
  return best ? best.label : "Admin";
}
