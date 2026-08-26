function normalizeIntentText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

const RESPONSES = {
  handoff: {
    type: "handoff",
    needsHuman: true,
    text:
      "Mình là trợ lý tự động của BookShop. Mình đã chuyển cuộc trò chuyện này cho nhân viên hỗ trợ. Bạn có thể gửi thêm mã đơn hàng và mô tả ngắn để được xử lý nhanh hơn.",
  },
  tracking: {
    type: "faq",
    needsHuman: false,
    text:
      "Bạn có thể theo dõi đơn tại Tài khoản → Đơn hàng của tôi. Mở chi tiết đơn để xem trạng thái, mã vận đơn và tiến trình giao hàng. Nếu trạng thái chưa cập nhật, hãy chọn “Gặp nhân viên” và gửi mã đơn.",
  },
  returns: {
    type: "faq",
    needsHuman: false,
    text:
      "BookShop tiếp nhận yêu cầu đổi trả trong 7 ngày kể từ khi nhận hàng. Hãy mở chi tiết đơn đã giao, chọn “Hỗ trợ & đổi trả”, chọn loại “Đổi/trả sản phẩm”, điền lý do và đính kèm ảnh nếu sách sai, thiếu hoặc hư hỏng.",
  },
  shipping: {
    type: "faq",
    needsHuman: false,
    text:
      "BookShop hỗ trợ giao hàng toàn quốc. Đơn thường được xử lý trong 1–2 ngày làm việc; giao tiêu chuẩn dự kiến 3–5 ngày và giao nhanh 1–2 ngày tùy khu vực.",
  },
  payment: {
    type: "faq",
    needsHuman: false,
    text:
      "BookShop hỗ trợ thanh toán khi nhận hàng (COD), VNPay QR/thẻ ngân hàng và ví MoMo. Nếu thanh toán trực tuyến thất bại, bạn có thể thử lại trong chi tiết đơn khi đơn còn hiệu lực.",
  },
  greeting: {
    type: "greeting",
    needsHuman: false,
    text:
      "Xin chào! Mình là trợ lý tự động của BookShop. Mình có thể hỗ trợ nhanh về đơn hàng, vận chuyển, đổi trả và thanh toán. Bạn cũng có thể nhắn “Gặp nhân viên” bất cứ lúc nào.",
  },
  fallback: {
    type: "fallback",
    needsHuman: true,
    text:
      "Mình là trợ lý tự động và chưa thể trả lời chắc chắn câu hỏi này. Mình đã chuyển nội dung cho nhân viên hỗ trợ; bạn có thể gửi thêm mã đơn hàng hoặc thông tin liên quan trong lúc chờ.",
  },
};

function buildAutoReply(value) {
  const text = normalizeIntentText(value);
  if (!text) return null;

  if (
    includesAny(text, [
      "gap nhan vien",
      "nhan vien ho tro",
      "nguoi that",
      "chuyen nhan vien",
      "tu van vien",
    ])
  ) {
    return RESPONSES.handoff;
  }

  if (
    includesAny(text, [
      "theo doi don",
      "tra cuu don",
      "trang thai don",
      "don hang cua toi",
      "don cua toi",
      "ma van don",
      "don den dau",
    ])
  ) {
    return RESPONSES.tracking;
  }

  if (
    includesAny(text, [
      "doi tra",
      "tra hang",
      "hoan tien",
      "giao sai",
      "giao thieu",
      "bi hu hong",
      "sach hu",
    ])
  ) {
    return RESPONSES.returns;
  }

  if (
    includesAny(text, [
      "giao hang",
      "van chuyen",
      "phi ship",
      "phi giao",
      "toan quoc",
      "bao lau nhan",
      "thoi gian giao",
    ])
  ) {
    return RESPONSES.shipping;
  }

  if (
    includesAny(text, [
      "thanh toan",
      "cod",
      "vnpay",
      "momo",
      "chuyen khoan",
      "the ngan hang",
    ])
  ) {
    return RESPONSES.payment;
  }

  if (/^(xin chao|chao|hello|hi|hey|alo)( ban| shop| bookshop)?$/.test(text)) {
    return RESPONSES.greeting;
  }

  return RESPONSES.fallback;
}

module.exports = { buildAutoReply, normalizeIntentText };
