/**
 * Payment Gateway Adapter (mock)
 *
 * Trong production, file này sẽ được thay bằng SDK thật của VNPay / ZaloPay /
 * Stripe. Các hàm bên dưới giữ đúng interface để code nghiệp vụ không đổi.
 */

const crypto = require("crypto");

/**
 * Tạo URL thanh toán để redirect user sang cổng thanh toán.
 * @param {Object} opts
 * @param {string} opts.orderCode
 * @param {number} opts.amount        - số tiền (VND)
 * @param {string} opts.method        - VNPAY | ZALOPAY | STRIPE
 * @param {string} opts.returnUrl
 */
async function createPaymentUrl({ orderCode, amount, method, returnUrl }) {
  const txnRef = `${method}-${orderCode}-${Date.now()}`;
  // Trong thực tế: ký HMAC, build URL theo spec VNPay / ZaloPay ...
  const url =
    `https://sandbox.payment-gateway.local/pay` +
    `?method=${method}` +
    `&txnRef=${encodeURIComponent(txnRef)}` +
    `&amount=${amount}` +
    `&returnUrl=${encodeURIComponent(returnUrl || "")}`;
  return { paymentUrl: url, transactionId: txnRef };
}

/**
 * Xác thực chữ ký webhook từ cổng thanh toán.
 * Mỗi cổng có spec riêng; đây là ví dụ HMAC-SHA256.
 */
function verifyWebhookSignature({ payload, signature, secret }) {
  if (!secret) return true; // dev mode
  const raw =
    typeof payload === "string" ? payload : JSON.stringify(payload || {});
  const expected = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex");
  return expected === signature;
}

/**
 * Gọi API refund của cổng thanh toán.
 * Trả về { ok, refundTransactionId } - nếu ok=true nghĩa là cổng đã NHẬN yêu
 * cầu hoàn tiền; kết quả cuối cùng sẽ về qua webhook `refund.success`.
 */
async function requestRefund({ transactionId, amount, reason }) {
  // Trong production: axios.post(gatewayUrl, { ... }, { headers: { sig } })
  if (!transactionId) {
    return { ok: false, error: "Missing transactionId" };
  }
  const refundTransactionId = `RF-${transactionId}-${Date.now()}`;
  return {
    ok: true,
    refundTransactionId,
    amount,
    reason,
    status: "PENDING_GATEWAY",
  };
}

module.exports = {
  createPaymentUrl,
  verifyWebhookSignature,
  requestRefund,
};
