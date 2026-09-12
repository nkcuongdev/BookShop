const LEGAL_CONTENT = {
  terms: {
    title: "Điều khoản sử dụng",
    sections: [
      ["Tài khoản", "Bạn chịu trách nhiệm bảo mật thông tin đăng nhập và cung cấp thông tin đặt hàng chính xác."],
      ["Đặt hàng và thanh toán", "Đơn hàng chỉ được xác nhận sau khi hệ thống ghi nhận thành công. Giá, phí vận chuyển và ưu đãi được hiển thị trước khi bạn xác nhận."],
      ["Hủy và hoàn tiền", "Việc hủy, đổi trả và hoàn tiền phụ thuộc trạng thái đơn hàng và phương thức thanh toán đã chọn."],
      ["Sử dụng hợp lệ", "Không sử dụng dịch vụ để gian lận, phá hoại hệ thống hoặc xâm phạm quyền của người khác."],
    ],
  },
  privacy: {
    title: "Chính sách bảo mật",
    sections: [
      ["Dữ liệu thu thập", "BookShop lưu thông tin tài khoản, địa chỉ giao hàng, lịch sử đơn hàng và sự kiện sử dụng cần thiết để vận hành dịch vụ."],
      ["Mục đích sử dụng", "Dữ liệu được dùng để xử lý đơn hàng, hỗ trợ khách hàng, bảo vệ tài khoản và cải thiện trải nghiệm."],
      ["Bảo mật và lưu trữ", "Mật khẩu được băm; phiên đăng nhập và dữ liệu nhạy cảm được giới hạn truy cập. Dữ liệu chỉ được giữ trong thời gian cần thiết."],
      ["Quyền của bạn", "Bạn có thể cập nhật thông tin cá nhân trong trang hồ sơ hoặc liên hệ BookShop để yêu cầu hỗ trợ về dữ liệu."],
    ],
  },
};

export default function LegalPage({ type }) {
  const content = LEGAL_CONTENT[type] || LEGAL_CONTENT.terms;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-h1 font-display font-bold text-foreground">{content.title}</h1>
      <p className="mt-2 text-base text-muted-foreground">Cập nhật lần cuối: 26/07/2026</p>
      <div className="mt-8 space-y-6 rounded-2xl bg-card p-6 ring-1 ring-foreground/[0.06] shadow-rest sm:p-8">
        {content.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2 className="text-h3 font-semibold text-foreground">{heading}</h2>
            <p className="mt-2 leading-7 text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
