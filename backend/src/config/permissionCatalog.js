/**
 * The permission catalogue: every permission the system enforces, grouped by
 * business area, with Vietnamese labels for the role-management UI.
 *
 * Permissions are code, not data. Each key here corresponds to a
 * requirePermission() call in a route, so adding one means adding a gate —
 * which is why admins can compose roles but cannot invent permissions.
 *
 * Flags:
 *   sensitive — money, destructive, or privacy-bearing; the UI warns on it.
 *   adminOnly — never grantable to a non-admin role; the UI locks the checkbox
 *               and routes/roles.js refuses it server-side.
 */

const PERMISSION_GROUPS = Object.freeze([
  {
    group: "Truy cập chung",
    items: [
      {
        key: "admin.access",
        label: "Vào khu quản trị",
        description:
          "Bắt buộc để đăng nhập được vào /admin. Thiếu quyền này thì mọi quyền khác đều vô nghĩa.",
      },
      {
        key: "dashboard.view",
        label: "Xem trang tổng quan",
        description: "Các chỉ số cơ bản: số đơn, số người dùng, số sách đã bán.",
      },
      {
        key: "analytics.view",
        label: "Xem doanh thu & phân tích",
        description:
          "Toàn bộ số liệu tiền: doanh thu, giá trị đơn trung bình, biểu đồ, phễu chuyển đổi.",
        sensitive: true,
      },
    ],
  },
  {
    group: "Sách & danh mục",
    items: [
      { key: "book.read", label: "Xem sách", description: "Danh sách và chi tiết sách, gồm cả sách đang ẩn." },
      { key: "book.write", label: "Thêm / sửa sách", description: "Tạo sách mới và sửa thông tin, giá, ảnh bìa." },
      {
        key: "book.delete",
        label: "Xoá sách",
        description: "Xoá sách khỏi hệ thống. Không thể hoàn tác.",
        sensitive: true,
      },
      { key: "category.manage", label: "Quản lý danh mục sách", description: "Thêm, sửa, xoá danh mục sản phẩm." },
    ],
  },
  {
    group: "Đơn hàng",
    items: [
      { key: "order.read", label: "Xem đơn hàng", description: "Danh sách và chi tiết đơn của mọi khách." },
      { key: "order.export", label: "Xuất báo cáo đơn (CSV)", description: "Tải file báo cáo đơn hàng kèm số tiền.", sensitive: true },
      {
        key: "order.support",
        label: "Xử lý đơn (CSKH)",
        description: "Duyệt đơn, huỷ đơn, xét yêu cầu đổi/trả hàng của khách.",
      },
      {
        key: "order.fulfill",
        label: "Giao vận",
        description: "Tạo/huỷ vận đơn, bàn giao vận chuyển, xác nhận đã giao.",
      },
      {
        key: "order.payment.audit",
        label: "Xem lịch sử thanh toán",
        description: "Nhật ký giao dịch với cổng thanh toán của từng đơn.",
        sensitive: true,
      },
    ],
  },
  {
    group: "Tồn kho",
    items: [
      { key: "inventory.read", label: "Xem tồn kho", description: "Tồn hiện tại, lịch sử biến động, danh sách sắp hết hàng, giá trị tồn." },
      { key: "inventory.write", label: "Lập phiếu kho", description: "Tạo và xác nhận phiếu nhập, phiếu xuất, phiếu kiểm kho." },
      {
        key: "inventory.adjust",
        label: "Điều chỉnh tồn trực tiếp",
        description: "Sửa số tồn không qua phiếu. Bỏ qua mọi chứng từ nên cần hạn chế.",
        sensitive: true,
      },
    ],
  },
  {
    group: "Nhà cung cấp",
    items: [
      { key: "supplier.read", label: "Xem nhà cung cấp", description: "Danh sách nhà cung cấp và sách của họ." },
      { key: "supplier.write", label: "Thêm / sửa nhà cung cấp", description: "Tạo, sửa, ngừng hợp tác, xoá nhà cung cấp." },
    ],
  },
  {
    group: "Nội dung",
    items: [
      { key: "post.read", label: "Xem bài viết", description: "Danh sách bài viết gồm cả bản nháp." },
      { key: "post.write", label: "Viết / sửa bài", description: "Tạo, sửa, xoá bài viết." },
      { key: "post.publish", label: "Xuất bản bài viết", description: "Đăng bài lên trang tin hoặc gỡ xuống." },
      { key: "postCategory.manage", label: "Quản lý danh mục bài viết", description: "Thêm, sửa, xoá danh mục bài viết." },
      { key: "newsletter.manage", label: "Gửi newsletter", description: "Xem người đăng ký và gửi email newsletter." },
      { key: "review.moderate", label: "Kiểm duyệt đánh giá", description: "Ẩn, hiện, xử lý báo cáo đánh giá của khách." },
    ],
  },
  {
    group: "Khuyến mãi",
    items: [
      { key: "voucher.manage", label: "Quản lý voucher", description: "Tạo, sửa, bật/tắt, xoá mã giảm giá." },
      { key: "promotion.manage", label: "Quản lý chương trình khuyến mãi", description: "Tạo, sửa, bật/tắt chiến dịch giảm giá theo sách." },
      {
        key: "loyalty.read",
        label: "Xem điểm thưởng & hạng thành viên",
        description:
          "Cấu hình chương trình, sổ điểm của từng khách và danh mục quà đổi điểm.",
      },
      {
        key: "loyalty.manage",
        label: "Quản lý chương trình điểm thưởng",
        description:
          "Sửa tỉ lệ tích/tiêu điểm, ngưỡng và hệ số từng hạng, danh mục quà đổi voucher.",
        sensitive: true,
      },
      {
        key: "loyalty.adjust",
        label: "Điều chỉnh điểm thủ công",
        description:
          "Cộng hoặc trừ điểm trực tiếp vào tài khoản khách. Tương đương phát tiền nên mọi thao tác đều vào nhật ký.",
        sensitive: true,
      },
    ],
  },
  {
    group: "Hỗ trợ khách hàng",
    items: [
      { key: "ticket.read", label: "Xem ticket hỗ trợ", description: "Hàng đợi ticket và nội dung từng ticket." },
      { key: "ticket.write", label: "Trả lời ticket", description: "Nhận ticket, trả lời khách, đổi trạng thái. Cũng quyết định ai xuất hiện trong danh sách người phụ trách." },
      { key: "ticket.resolve", label: "Xử lý bồi hoàn ticket", description: "Chốt phương án: hoàn tiền, gửi lại hàng, đóng ticket.", sensitive: true },
      { key: "chat.read", label: "Xem chat", description: "Đọc mọi hội thoại chat với khách." },
      { key: "chat.write", label: "Trả lời chat", description: "Gửi tin nhắn cho khách trong khung chat." },
      { key: "customer.read", label: "Tra cứu khách hàng", description: "Xem thông tin cơ bản của khách để phục vụ hỗ trợ." },
    ],
  },
  {
    group: "Hệ thống",
    items: [
      {
        key: "user.manage",
        label: "Quản lý người dùng",
        description: "Xem danh sách, cấm, mở khoá và xoá tài khoản.",
        sensitive: true,
        adminOnly: true,
      },
      {
        key: "user.role.assign",
        label: "Phân vai trò cho người dùng",
        description:
          "Gán vai trò cho tài khoản khác. Chỉ được gán vai trò không vượt quá quyền của chính mình.",
        sensitive: true,
        adminOnly: true,
      },
      {
        key: "role.read",
        label: "Xem vai trò & quyền",
        description: "Mở được trang ma trận vai trò và quyền hạn.",
        adminOnly: true,
      },
      {
        key: "role.manage",
        label: "Sửa vai trò & quyền",
        description: "Tạo, sửa, xoá vai trò và thay đổi quyền của từng vai trò.",
        sensitive: true,
        adminOnly: true,
      },
      { key: "upload.admin", label: "Tải ảnh lên kho quản trị", description: "Upload ảnh dùng cho sách, bài viết, khuyến mãi." },
      {
        key: "audit.read",
        label: "Xem nhật ký quản trị",
        description:
          "Ai đã sửa giá, sửa tồn, đổi trạng thái đơn, duyệt hoàn tiền hay khoá tài khoản, kèm giá trị trước và sau.",
        sensitive: true,
        adminOnly: true,
      },
    ],
  },
]);

/** Flat list of every permission key, in catalogue order. */
const PERMISSIONS = Object.freeze(
  PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key))
);

const PERMISSION_SET = new Set(PERMISSIONS);

const ADMIN_ONLY_PERMISSIONS = Object.freeze(
  PERMISSION_GROUPS.flatMap((group) =>
    group.items.filter((item) => item.adminOnly).map((item) => item.key)
  )
);

const isKnownPermission = (permission) => PERMISSION_SET.has(permission);

/** Reject unknown keys and keep catalogue order so stored arrays are stable. */
const sanitizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];
  const requested = new Set(permissions.map((p) => String(p || "").trim()));
  return PERMISSIONS.filter((permission) => requested.has(permission));
};

module.exports = {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  isKnownPermission,
  sanitizePermissions,
};
