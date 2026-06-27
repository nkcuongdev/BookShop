const nodemailer = require("nodemailer");
const config = require("../config");

let transporter;

// Email clients cannot read the frontend CSS variables, so these values mirror
// the core brand tokens in frontend/src/index.css.
const EMAIL_THEME = Object.freeze({
  primary: "#4338CA",
  primaryForeground: "#FFFFFF",
  sale: "#C2410C",
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getTransporter() {
  if (!config.mail.enabled || config.mail.provider !== "smtp") return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: {
        user: config.mail.user,
        pass: config.mail.password,
      },
    });
  }
  return transporter;
}

async function sendMail(message) {
  if (!config.mail.enabled) return null;
  if (config.mail.provider === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.mail.resendApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "bookshop-api/1.0",
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(config.mail.requestTimeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        String(payload.message || `Email provider returned ${response.status}`)
      );
    }
    return payload;
  }

  const mailer = getTransporter();
  if (!mailer) return null;
  return mailer.sendMail({ from: config.mail.from, ...message });
}

async function sendLinkEmail({ to, subject, heading, message, url }) {
  if (!config.mail.enabled) {
    if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
      console.info(`[mail:development] ${subject} -> ${to}: ${url}`);
    }
    return { delivered: false, previewUrl: url };
  }

  await sendMail({
    to,
    subject,
    text: `${heading}\n\n${message}\n\n${url}`,
    html: `<h2>${escapeHtml(heading)}</h2><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
  });
  return { delivered: true };
}

async function sendEmailChangeNotice(to, pendingEmail) {
  if (!config.mail.enabled) return { delivered: false };
  const subject = "Yêu cầu đổi email BookShop";
  const message = `Tài khoản của bạn vừa yêu cầu đổi email đăng nhập sang ${pendingEmail}. Email hiện tại vẫn có hiệu lực cho đến khi địa chỉ mới được xác minh. Nếu không phải bạn, hãy đổi mật khẩu ngay.`;
  await sendMail({
    to,
    subject,
    text: message,
    html: `<h2>${escapeHtml(subject)}</h2><p>${escapeHtml(message)}</p>`,
  });
  return { delivered: true };
}

function sendPasswordReset(to, url) {
  return sendLinkEmail({
    to,
    url,
    subject: "Đặt lại mật khẩu BookShop",
    heading: "Yêu cầu đặt lại mật khẩu",
    message: "Liên kết này chỉ dùng được một lần và hết hạn sau 30 phút.",
  });
}

function sendEmailVerification(to, url) {
  return sendLinkEmail({
    to,
    url,
    subject: "Xác minh email BookShop",
    heading: "Xác minh địa chỉ email",
    message: "Liên kết này chỉ dùng được một lần và hết hạn sau 24 giờ.",
  });
}

function sendNewsletterConfirmation(to, url) {
  return sendLinkEmail({
    to,
    url,
    subject: "Xác nhận đăng ký nhận tin BookShop",
    heading: "Xác nhận đăng ký nhận tin",
    message:
      "Nhấn vào liên kết để đồng ý nhận ưu đãi và gợi ý sách từ BookShop. Liên kết hết hạn sau 24 giờ.",
  });
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function formatNewsletterPromotion(content) {
  const value = Number(
    content.contentType === "voucher"
      ? content.voucherValue
      : content.promotionValue
  );
  if (!Number.isFinite(value)) return "";
  const type =
    content.contentType === "voucher"
      ? content.voucherType
      : content.promotionType;
  return type === "percent"
    ? `Giảm ${value}%`
    : `Giảm ${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

function buildNewsletterEmail({ content = {}, unsubscribeUrl = "" } = {}) {
  const title = String(content.title || "Tin mới từ BookShop").trim();
  const description = String(content.description || "").trim();
  const contentUrl = resolveFrontendUrl(content.path);
  const safeImageUrl = safeHttpUrl(content.imageUrl);
  const safeUnsubscribeUrl = safeHttpUrl(unsubscribeUrl);
  const isPromotion = content.contentType === "promotion";
  const isVoucher = content.contentType === "voucher";
  const promotionLabel =
    isPromotion || isVoucher ? formatNewsletterPromotion(content) : "";
  const ctaLabel = isPromotion
    ? "Xem sách khuyến mãi"
    : isVoucher
      ? "Mua sắm và dùng voucher"
      : "Đọc bài viết";
  const subject = `[BookShop] ${promotionLabel ? `${promotionLabel} - ` : ""}${title}`;
  const image = safeImageUrl
    ? `<img src="${escapeHtml(safeImageUrl)}" alt="" width="584" style="display:block;width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin-bottom:22px" />`
    : "";
  const voucherCode = isVoucher ? String(content.voucherCode || "").trim() : "";
  const voucherDetails = isVoucher
    ? [
        content.voucherScope === "shipping"
          ? "Áp dụng phí vận chuyển"
          : "Áp dụng cho đơn hàng",
        Number(content.minOrder) > 0
          ? `Đơn tối thiểu ${new Intl.NumberFormat("vi-VN").format(content.minOrder)}đ`
          : "",
        Number(content.maxDiscount) > 0
          ? `Giảm tối đa ${new Intl.NumberFormat("vi-VN").format(content.maxDiscount)}đ`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const voucherBlock = isVoucher
    ? `<div style="margin:0 0 22px;padding:16px;border:1px dashed #fb923c;border-radius:12px;background:#fff7ed"><div style="font-size:12px;color:#9a3412;text-transform:uppercase">Mã voucher</div><div style="margin-top:4px;font-size:24px;font-weight:800;letter-spacing:1px;color:#c2410c">${escapeHtml(voucherCode)}</div>${voucherDetails ? `<div style="margin-top:8px;font-size:13px;line-height:1.5;color:#7c2d12">${escapeHtml(voucherDetails)}</div>` : ""}</div>`
    : "";
  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="background:${EMAIL_THEME.primary};padding:22px 28px;color:${EMAIL_THEME.primaryForeground}"><div style="font-size:22px;font-weight:700">BookShop</div><div style="margin-top:4px;font-size:13px;opacity:.9">Sách hay và ưu đãi dành cho bạn</div></td></tr><tr><td style="padding:28px">${image}${promotionLabel ? `<p style="margin:0 0 10px;color:${EMAIL_THEME.sale};font-size:16px;font-weight:700">${escapeHtml(promotionLabel)}</p>` : ""}<h1 style="margin:0 0 12px;font-size:24px;line-height:1.35">${escapeHtml(title)}</h1>${description ? `<p style="margin:0 0 22px;color:#475569;line-height:1.65">${escapeHtml(description)}</p>` : ""}${voucherBlock}<a href="${escapeHtml(contentUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${EMAIL_THEME.primary};color:${EMAIL_THEME.primaryForeground};text-decoration:none;font-weight:700">${escapeHtml(ctaLabel)}</a><p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#94a3b8">Bạn nhận email này vì đã xác nhận đăng ký newsletter BookShop.${safeUnsubscribeUrl ? ` <a href="${escapeHtml(safeUnsubscribeUrl)}" style="color:#64748b">Hủy đăng ký</a>` : ""}</p></td></tr></table></td></tr></table></body></html>`;
  const text = [
    promotionLabel,
    title,
    description,
    voucherCode ? `Mã voucher: ${voucherCode}` : "",
    voucherDetails,
    "",
    `${ctaLabel}: ${contentUrl}`,
    safeUnsubscribeUrl ? `Hủy đăng ký: ${safeUnsubscribeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, text, html, url: contentUrl };
}

async function sendNewsletterContent(to, payload) {
  const email = buildNewsletterEmail(payload);
  if (!config.mail.enabled) {
    return { delivered: false, previewUrl: email.url };
  }
  await sendMail({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return { delivered: true };
}

function resolveFrontendUrl(link = "") {
  const normalizedLink = String(link || "");
  const safePath = normalizedLink.startsWith("/") && !normalizedLink.startsWith("//")
    ? normalizedLink
    : "";
  return safePath
    ? `${config.frontendUrl.replace(/\/$/, "")}${safePath}`
    : config.frontendUrl;
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

function paymentMethodLabel(method) {
  return {
    COD: "Thanh toán khi nhận hàng",
    VNPAY: "VNPay",
    MOMO: "MoMo",
  }[String(method || "").toUpperCase()] || String(method || "");
}

function buildOrderLifecycleEmail(payload = {}, order = {}, recipientName = "") {
  const metadata = payload.metadata || {};
  const orderCode = String(order.orderCode || metadata.orderCode || "").trim();
  const title = String(payload.title || "Cập nhật đơn hàng BookShop").trim();
  const message = String(
    payload.message || "Đơn hàng của bạn vừa có cập nhật mới."
  ).trim();
  const url = resolveFrontendUrl(payload.link);
  const totalAmount = formatCurrency(order.totalAmount ?? metadata.totalAmount);
  const paymentMethod = paymentMethodLabel(
    order.payment?.method || metadata.paymentMethod
  );
  const trackingNumber = String(
    order.trackingNumber || metadata.trackingNumber || ""
  ).trim();
  const carrier = String(order.carrier || metadata.carrier || "").trim();
  const items = Array.isArray(order.items) ? order.items.slice(0, 8) : [];
  const greeting = recipientName ? `Xin chào ${recipientName},` : "Xin chào,";
  const subject = orderCode
    ? `[BookShop] ${title} - ${orderCode}`
    : `[BookShop] ${title}`;

  const itemRows = items
    .map((item) => {
      const quantity = Number(item.quantity) || 1;
      const amount = formatCurrency(
        item.subtotal ?? (Number(item.price) || 0) * quantity
      );
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#334155">${escapeHtml(item.title || "Sản phẩm")} <span style="color:#64748b">× ${quantity}</span></td><td style="padding:10px 0;border-bottom:1px solid #eef2f7;text-align:right;color:#334155;white-space:nowrap">${escapeHtml(amount)}</td></tr>`;
    })
    .join("");
  const orderFacts = [
    orderCode ? ["Mã đơn", orderCode] : null,
    totalAmount ? ["Tổng thanh toán", totalAmount] : null,
    paymentMethod ? ["Phương thức", paymentMethod] : null,
    carrier ? ["Đơn vị vận chuyển", carrier] : null,
    trackingNumber ? ["Mã vận đơn", trackingNumber] : null,
  ].filter(Boolean);
  const factRows = orderFacts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:5px 0;color:#64748b">${escapeHtml(label)}</td><td style="padding:5px 0;text-align:right;font-weight:600;color:#0f172a">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(message)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="background:${EMAIL_THEME.primary};padding:22px 28px;color:${EMAIL_THEME.primaryForeground}"><div style="font-size:22px;font-weight:700">BookShop</div><div style="margin-top:4px;font-size:13px;opacity:.9">Thông tin giao dịch đơn hàng</div></td></tr><tr><td style="padding:28px"><p style="margin:0 0 12px;color:#475569">${escapeHtml(greeting)}</p><h1 style="margin:0 0 12px;font-size:24px;line-height:1.3">${escapeHtml(title)}</h1><p style="margin:0 0 22px;color:#475569;line-height:1.6">${escapeHtml(message)}</p>${factRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;padding:14px 16px;background:#f8fafc;border-radius:12px">${factRows}</table>` : ""}${itemRows ? `<h2 style="margin:0 0 6px;font-size:16px">Sản phẩm</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px">${itemRows}</table>` : ""}<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${EMAIL_THEME.primary};color:${EMAIL_THEME.primaryForeground};text-decoration:none;font-weight:700">Xem chi tiết đơn hàng</a><p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8">Đây là email giao dịch tự động từ BookShop. Nếu cần hỗ trợ, vui lòng sử dụng Trung tâm hỗ trợ trên website.</p></td></tr></table></td></tr></table></body></html>`;

  const textLines = [
    greeting,
    "",
    title,
    message,
    "",
    ...orderFacts.map(([label, value]) => `${label}: ${value}`),
    ...(items.length
      ? [
          "",
          "Sản phẩm:",
          ...items.map((item) => {
            const quantity = Number(item.quantity) || 1;
            const amount = formatCurrency(
              item.subtotal ?? (Number(item.price) || 0) * quantity
            );
            return `- ${item.title || "Sản phẩm"} × ${quantity}${amount ? `: ${amount}` : ""}`;
          }),
        ]
      : []),
    "",
    `Xem chi tiết: ${url}`,
  ];

  return { subject, text: textLines.join("\n"), html, url };
}

async function sendOrderLifecycleEmail(to, payload, order, recipientName = "") {
  const email = buildOrderLifecycleEmail(payload, order, recipientName);
  if (!config.mail.enabled) {
    if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
      console.info(`[mail:development] ${email.subject} -> ${to}: ${email.url}`);
    }
    return { delivered: false, previewUrl: email.url };
  }
  await sendMail({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return { delivered: true };
}

function buildCartReminderEmail({
  items = [],
  itemCount = 0,
  totalAmount = 0,
  recipientName = "",
  stage = 1,
  hiddenCount = 0,
  unsubscribeUrl = "",
} = {}) {
  const cartUrl = resolveFrontendUrl("/cart");
  const safeUnsubscribeUrl = safeHttpUrl(unsubscribeUrl);
  const greeting = recipientName ? `Xin chào ${recipientName},` : "Xin chào,";
  const isFollowUp = stage > 1;
  const subject = isFollowUp
    ? "[BookShop] Giỏ hàng của bạn sắp hết ưu đãi"
    : "[BookShop] Bạn còn sách đang chờ trong giỏ hàng";
  const heading = isFollowUp
    ? "Sách trong giỏ vẫn đang chờ bạn"
    : "Bạn bỏ quên vài cuốn sách";
  const intro = isFollowUp
    ? `Giỏ hàng của bạn vẫn còn ${itemCount} sản phẩm. Số lượng có hạn nên sách có thể hết bất cứ lúc nào — hoàn tất đơn ngay để không bỏ lỡ.`
    : `Chúng tôi giữ lại ${itemCount} sản phẩm trong giỏ hàng của bạn. Bạn chỉ cần vài bước để hoàn tất đơn hàng.`;

  const itemRows = items
    .map((item) => {
      const quantity = Number(item.quantity) || 1;
      const lineTotal = formatCurrency((Number(item.price) || 0) * quantity);
      const safeImage = safeHttpUrl(item.imageUrl);
      const thumbnail = safeImage
        ? `<td width="64" style="padding:10px 12px 10px 0;vertical-align:top"><img src="${escapeHtml(safeImage)}" alt="" width="56" style="display:block;width:56px;border-radius:8px" /></td>`
        : "";
      return `<tr>${thumbnail}<td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#334155;vertical-align:top">${escapeHtml(item.title || "Sản phẩm")} <span style="color:#64748b">× ${quantity}</span></td><td style="padding:10px 0;border-bottom:1px solid #eef2f7;text-align:right;color:#334155;white-space:nowrap;vertical-align:top">${escapeHtml(lineTotal)}</td></tr>`;
    })
    .join("");
  const moreRow = hiddenCount > 0
    ? `<tr><td colspan="3" style="padding:10px 0;color:#64748b;font-size:13px">và ${hiddenCount} sản phẩm khác trong giỏ hàng</td></tr>`
    : "";
  const totalLabel = formatCurrency(totalAmount);

  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(intro)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="background:${EMAIL_THEME.primary};padding:22px 28px;color:${EMAIL_THEME.primaryForeground}"><div style="font-size:22px;font-weight:700">BookShop</div><div style="margin-top:4px;font-size:13px;opacity:.9">Giỏ hàng đang chờ bạn</div></td></tr><tr><td style="padding:28px"><p style="margin:0 0 12px;color:#475569">${escapeHtml(greeting)}</p><h1 style="margin:0 0 12px;font-size:24px;line-height:1.3">${escapeHtml(heading)}</h1><p style="margin:0 0 22px;color:#475569;line-height:1.65">${escapeHtml(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px">${itemRows}${moreRow}</table>${totalLabel ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;padding:14px 16px;background:#f8fafc;border-radius:12px"><tr><td style="color:#64748b">Tạm tính</td><td style="text-align:right;font-weight:700;font-size:18px;color:#0f172a">${escapeHtml(totalLabel)}</td></tr></table>` : ""}<a href="${escapeHtml(cartUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${EMAIL_THEME.primary};color:${EMAIL_THEME.primaryForeground};text-decoration:none;font-weight:700">Hoàn tất đơn hàng</a><p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#94a3b8">Bạn nhận email này vì đang bật nhắc nhở giỏ hàng trong tài khoản BookShop.${safeUnsubscribeUrl ? ` <a href="${escapeHtml(safeUnsubscribeUrl)}" style="color:#64748b">Tắt nhắc nhở</a>` : ""}</p></td></tr></table></td></tr></table></body></html>`;

  const text = [
    greeting,
    "",
    heading,
    intro,
    "",
    ...items.map((item) => {
      const quantity = Number(item.quantity) || 1;
      const lineTotal = formatCurrency((Number(item.price) || 0) * quantity);
      return `- ${item.title || "Sản phẩm"} × ${quantity}${lineTotal ? `: ${lineTotal}` : ""}`;
    }),
    hiddenCount > 0 ? `- và ${hiddenCount} sản phẩm khác` : "",
    "",
    totalLabel ? `Tạm tính: ${totalLabel}` : "",
    "",
    `Hoàn tất đơn hàng: ${cartUrl}`,
    safeUnsubscribeUrl ? `Tắt nhắc nhở: ${safeUnsubscribeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, text, html, url: cartUrl };
}

async function sendCartReminderEmail(to, payload) {
  const email = buildCartReminderEmail(payload);
  if (!config.mail.enabled) {
    if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
      console.info(`[mail:development] ${email.subject} -> ${to}: ${email.url}`);
    }
    return { delivered: false, previewUrl: email.url };
  }
  await sendMail({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  return { delivered: true };
}

function sendNotificationEmail(to, { title, message, link = "" }) {
  const url = resolveFrontendUrl(link);
  return sendLinkEmail({
    to,
    url,
    subject: title,
    heading: title,
    message: message || "Bạn có thông báo mới từ BookShop.",
  });
}

async function verifyEmailTransport() {
  if (!config.mail.enabled) return { enabled: false, healthy: false };
  if (config.mail.provider === "resend") {
    return { enabled: true, healthy: true };
  }
  const mailer = getTransporter();
  if (!mailer) return { enabled: false, healthy: false };
  await mailer.verify();
  return { enabled: true, healthy: true };
}

module.exports = {
  buildCartReminderEmail,
  buildNewsletterEmail,
  buildOrderLifecycleEmail,
  sendCartReminderEmail,
  sendEmailChangeNotice,
  sendEmailVerification,
  sendPasswordReset,
  sendNewsletterConfirmation,
  sendNewsletterContent,
  sendNotificationEmail,
  sendOrderLifecycleEmail,
  verifyEmailTransport,
};
