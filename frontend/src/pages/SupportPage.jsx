import { Link } from "react-router-dom";

const SUPPORT_CONTENT = {
  shipping: {
    title: "Chính sách vận chuyển",
    intro: "Thông tin về thời gian, phí và quá trình giao sách.",
    sections: [
      ["Thời gian xử lý", "Đơn hợp lệ thường được xác nhận và đóng gói trong 1–2 ngày làm việc."],
      ["Thời gian giao", "Giao tiêu chuẩn dự kiến 3–5 ngày làm việc; giao nhanh dự kiến 1–2 ngày tùy khu vực."],
      ["Theo dõi đơn", "Mã vận đơn và tiến trình giao hàng được cập nhật trong mục Đơn hàng của tôi."],
      ["Kiểm tra hàng", "Vui lòng kiểm tra tình trạng kiện hàng trước khi nhận và lưu ảnh nếu kiện có dấu hiệu hư hỏng."],
    ],
  },
  returns: {
    title: "Đổi trả & hoàn tiền",
    intro: "Quy trình hỗ trợ khi sách giao sai, thiếu hoặc bị hư hỏng.",
    sections: [
      ["Điều kiện hỗ trợ", "Gửi yêu cầu trong vòng 7 ngày kể từ khi nhận hàng và giữ sách, phụ kiện cùng bao bì ở tình trạng nhận được."],
      ["Cách gửi yêu cầu", "Mở chi tiết đơn đã giao, chọn Hỗ trợ & đổi trả, sau đó chọn loại Đổi/trả sản phẩm, sản phẩm, số lượng và mô tả tình trạng."],
      ["Bằng chứng", "Cung cấp mã đơn và ảnh hoặc video thể hiện sản phẩm sai, thiếu hay hư hỏng để được xử lý nhanh."],
      ["Phương thức hoàn", "Khoản hoàn được gửi về phương thức thanh toán ban đầu; thời gian hiển thị phụ thuộc ngân hàng hoặc ví điện tử."],
      ["Chi phí đổi trả", "BookShop chịu phí nếu lỗi thuộc về sản phẩm hoặc quá trình xử lý đơn hàng."],
    ],
  },
  faq: {
    title: "Câu hỏi thường gặp",
    intro: "Giải đáp nhanh các câu hỏi phổ biến khi mua sách.",
    sections: [
      ["Tôi có cần tài khoản để đặt hàng?", "Có. Tài khoản giúp bảo vệ lịch sử đơn, địa chỉ và trạng thái thanh toán của bạn."],
      ["Khi nào tồn kho được giữ?", "Tồn kho được giữ khi đơn được tạo hợp lệ và sẽ được hoàn lại nếu đơn bị hủy hoặc hết hạn."],
      ["Tôi có thể sửa đánh giá không?", "Có. Chủ sở hữu có thể sửa hoặc xóa đánh giá của mình tại trang chi tiết sách."],
      ["Thanh toán thất bại thì sao?", "Bạn có thể thử thanh toán lại khi đơn còn hiệu lực mà không cần tạo đơn mới."],
    ],
  },
  contact: {
    title: "Liên hệ BookShop",
    intro: "Gửi mã đơn kèm mô tả ngắn để đội ngũ hỗ trợ phản hồi chính xác.",
    sections: [
      ["Email", "hello@bookshop.vn"],
      ["Điện thoại", "1900 1234"],
      ["Giờ hỗ trợ", "08:00–21:00 từ thứ Hai đến Chủ nhật."],
      ["Chat trực tuyến", "Đăng nhập và dùng nút chat ở góc màn hình để trao đổi với nhân viên hỗ trợ."],
    ],
  },
};

export default function SupportPage({ type }) {
  const content = SUPPORT_CONTENT[type] || SUPPORT_CONTENT.faq;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-h1 font-display font-bold text-foreground">{content.title}</h1>
      <p className="mt-3 leading-7 text-muted-foreground">{content.intro}</p>
      <div className="mt-8 space-y-6 rounded-2xl bg-card p-6 ring-1 ring-foreground/[0.06] shadow-rest sm:p-8">
        {content.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2 className="text-h3 font-semibold text-foreground">{heading}</h2>
            <p className="mt-2 leading-7 text-muted-foreground">{body}</p>
          </section>
        ))}
        <div className="border-t border-border pt-5 text-sm text-muted-foreground">
          Cần hỗ trợ thêm?{" "}
          <Link to="/support/contact" className="font-semibold text-primary hover:underline">
            Liên hệ BookShop
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
