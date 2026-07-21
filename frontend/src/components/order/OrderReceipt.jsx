import { Printer } from "lucide-react";
import { createPortal } from "react-dom";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { formatFullAddress } from "@/utils/address";
import {
  formatDateTimeVN,
  formatOrderCode,
  formatVND,
} from "@/utils/format.js";

const ORDER_STATUS_LABELS = {
  PENDING: "Chờ xử lý",
  PAID: "Đã thanh toán",
  PROCESSING: "Đang xử lý",
  CANCELLING: "Đang hủy đơn",
  SHIPPED: "Đang giao",
  DELIVERED: "Đã giao",
  CANCELLED: "Đã hủy",
  FAILED: "Thanh toán thất bại",
  REFUNDING: "Đang hoàn tiền",
  REFUNDED: "Đã hoàn tiền",
};

const PAYMENT_METHOD_LABELS = {
  COD: "Thanh toán khi nhận hàng (COD)",
  VNPAY: "VNPay",
  MOMO: "MoMo",
};

const PAYMENT_STATUS_LABELS = {
  UNPAID: "Chưa thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Thất bại",
  REFUNDING: "Đang hoàn tiền",
  REFUNDED: "Đã hoàn tiền",
};

const SHIPPING_METHOD_LABELS = {
  standard: "Giao hàng tiêu chuẩn",
  express: "Giao hàng nhanh",
};

function labelFor(labels, value, fallback = "—") {
  const key = String(value || "").toUpperCase();
  return labels[key] || value || fallback;
}

function ReceiptRow({ label, value, strong = false }) {
  return (
    <div className={`receipt-summary-row${strong ? " is-total" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const PAID_STATUSES = new Set(["PAID", "REFUNDING", "REFUNDED"]);

const STATUS_TONES = {
  PENDING: "warn",
  PROCESSING: "info",
  SHIPPED: "info",
  DELIVERED: "ok",
  PAID: "ok",
  CANCELLING: "warn",
  CANCELLED: "bad",
  FAILED: "bad",
  REFUNDING: "warn",
  REFUNDED: "muted",
};

export function OrderReceipt({ order }) {
  if (!order) return null;

  const code = formatOrderCode(order);
  const payment = order.payment || {};
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discountAmount) || 0;
  const shippingDiscount =
    Number(order.shippingDiscountAmount) ||
    (order.voucher?.scope === "shipping" ? discount : 0);
  const orderDiscount = Math.max(0, discount - shippingDiscount);
  const orderVoucherCode =
    order.voucher?.scope === "shipping" ? "" : order.voucher?.code;
  const shippingVoucherCode =
    order.shippingVoucher?.code ||
    (order.voucher?.scope === "shipping" ? order.voucher?.code : "");
  const shippingFee = Number(order.shippingFee) || 0;
  const total =
    order.totalAmount ?? Math.max(0, subtotal - discount + shippingFee);
  const items = order.items || [];
  const totalQuantity = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );
  const statusKey = String(order.status || "").toUpperCase();
  const statusTone = STATUS_TONES[statusKey] || "muted";
  const isPaid = PAID_STATUSES.has(String(payment.status || "").toUpperCase());

  return (
    <article className="order-receipt" aria-label={`Biên nhận đơn hàng ${code}`}>
      <header className="receipt-header">
        <div className="receipt-identity">
          <span className="receipt-logo" aria-hidden="true">
            B
          </span>
          <div>
            <p className="receipt-brand">BookShop</p>
            <p className="receipt-brand-subtitle">Nhà sách trực tuyến</p>
          </div>
        </div>
        <div className="receipt-heading">
          <h1>BIÊN NHẬN ĐIỆN TỬ</h1>
          <p className="receipt-code">{code}</p>
          <p className="receipt-issued">
            {formatDateTimeVN(order.placedAt || order.createdAt)}
          </p>
        </div>
      </header>

      <section className="receipt-meta-grid" aria-label="Thông tin biên nhận">
        <div>
          <span>Ngày đặt hàng</span>
          <strong>{formatDateTimeVN(order.placedAt || order.createdAt)}</strong>
        </div>
        <div>
          <span>Trạng thái đơn</span>
          <strong>
            <em className={`receipt-badge is-${statusTone}`}>
              {labelFor(ORDER_STATUS_LABELS, order.status)}
            </em>
          </strong>
        </div>
        <div>
          <span>Phương thức giao hàng</span>
          <strong>
            {SHIPPING_METHOD_LABELS[order.shippingMethod] ||
              order.shippingMethod ||
              "Giao hàng tiêu chuẩn"}
          </strong>
        </div>
        <div>
          <span>Trạng thái thanh toán</span>
          <strong>{labelFor(PAYMENT_STATUS_LABELS, payment.status)}</strong>
        </div>
      </section>

      <section className="receipt-section receipt-two-columns">
        <div className="receipt-panel">
          <h2>Người nhận</h2>
          <p className="receipt-recipient">
            <strong>{order.shippingAddress?.fullName || "—"}</strong>
            <span>{order.shippingAddress?.phone || "—"}</span>
            <span>{formatFullAddress(order.shippingAddress) || "—"}</span>
          </p>
        </div>
        <div className="receipt-panel">
          <h2>Thanh toán</h2>
          <p className="receipt-recipient">
            <strong>
              {labelFor(PAYMENT_METHOD_LABELS, payment.method, "Chưa xác định")}
            </strong>
            {payment.paidAt && (
              <span>Thanh toán lúc {formatDateTimeVN(payment.paidAt)}</span>
            )}
            {payment.transactionId && (
              <span className="receipt-mono">Mã GD: {payment.transactionId}</span>
            )}
          </p>
        </div>
      </section>

      <section className="receipt-section">
        <h2>Sản phẩm</h2>
        <table className="receipt-items">
          <thead>
            <tr>
              <th scope="col" className="receipt-index">#</th>
              <th scope="col">Sản phẩm</th>
              <th scope="col" className="receipt-number">Đơn giá</th>
              <th scope="col" className="receipt-number">SL</th>
              <th scope="col" className="receipt-number">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const quantity = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              const lineTotal = item.subtotal ?? price * quantity;
              return (
                <tr key={`${item.book?._id || item.book || item.bookId || "item"}-${index}`}>
                  <td className="receipt-index">{index + 1}</td>
                  <td>
                    <strong>{item.title || item.book?.title || "Sản phẩm"}</strong>
                    {(item.author || item.book?.author) && (
                      <span>{item.author || item.book?.author}</span>
                    )}
                  </td>
                  <td className="receipt-number">{formatVND(price)}</td>
                  <td className="receipt-number">{quantity}</td>
                  <td className="receipt-number receipt-line-total">
                    {formatVND(lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="receipt-totals" aria-label="Tổng tiền">
        <div className="receipt-totals-note">
          <p className="receipt-count">
            {items.length} sản phẩm · {totalQuantity} cuốn
          </p>
          {isPaid && (
            <p className="receipt-stamp" aria-label="Đã thanh toán">
              ĐÃ THANH TOÁN
            </p>
          )}
        </div>
        <dl>
          <ReceiptRow label="Tạm tính" value={formatVND(subtotal)} />
          {orderDiscount > 0 && (
            <ReceiptRow
              label={
                orderVoucherCode
                  ? `Giảm giá đơn hàng (${orderVoucherCode})`
                  : "Giảm giá đơn hàng"
              }
              value={`- ${formatVND(orderDiscount)}`}
            />
          )}
          {shippingDiscount > 0 && (
            <ReceiptRow
              label={
                shippingVoucherCode
                  ? `Giảm phí vận chuyển (${shippingVoucherCode})`
                  : "Giảm phí vận chuyển"
              }
              value={`- ${formatVND(shippingDiscount)}`}
            />
          )}
          <ReceiptRow
            label="Phí vận chuyển"
            value={shippingFee > 0 ? formatVND(shippingFee) : "Miễn phí"}
          />
          <ReceiptRow label="Tổng cộng" value={formatVND(total)} strong />
        </dl>
      </section>

      <footer className="receipt-footer">
        <p className="receipt-thanks">Cảm ơn bạn đã mua sắm tại BookShop.</p>
        <p>
          Đây là biên nhận điện tử phục vụ đối soát đơn hàng, không thay thế hóa
          đơn tài chính hoặc hóa đơn VAT.
        </p>
      </footer>
    </article>
  );
}

export default function OrderReceiptPrintButton({ order, className = "" }) {
  const receiptRootRef = useRef(null);

  if (!order) return null;

  const handlePrint = () => {
    const receiptRoot = receiptRootRef.current;
    if (!receiptRoot) return;

    const code = formatOrderCode(order).replace(/[^A-Z0-9-]/gi, "-");
    const frame = document.createElement("iframe");
    frame.setAttribute("title", "Khung in biên nhận");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      width: "0",
      height: "0",
      right: "0",
      bottom: "0",
      border: "0",
      visibility: "hidden",
    });
    document.body.appendChild(frame);

    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) {
      frame.remove();
      return;
    }

    const styles = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]')
    )
      .map((node) => node.outerHTML)
      .join("\n");
    const baseUrl = document.baseURI
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");

    let cleanedUp = false;
    let fallbackTimer;
    const cleanupFrame = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      printWindow.removeEventListener("afterprint", cleanupFrame);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      frame.remove();
    };

    frame.addEventListener(
      "load",
      () => {
        Promise.resolve(printDocument.fonts?.ready)
          .catch(() => undefined)
          .then(() => {
            printWindow.addEventListener("afterprint", cleanupFrame, { once: true });
            // Some browsers do not emit afterprint when the dialog is cancelled.
            fallbackTimer = window.setTimeout(cleanupFrame, 120_000);
            try {
              printWindow.focus?.();
              printWindow.print();
            } catch (error) {
              cleanupFrame();
              throw error;
            }
          });
      },
      { once: true }
    );

    printDocument.open();
    printDocument.write(`<!doctype html>
      <html lang="vi">
        <head>
          <meta charset="UTF-8" />
          <base href="${baseUrl}" />
          <title>Bien-nhan-${code}</title>
          ${styles}
        </head>
        <body>${receiptRoot.outerHTML}</body>
      </html>`);
    printDocument.close();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={handlePrint}
      >
        <Printer className="size-4" />
        In / Lưu PDF
      </Button>
      {createPortal(
        <div
          ref={receiptRootRef}
          className="order-receipt-print-root"
          aria-hidden="true"
        >
          <OrderReceipt order={order} />
        </div>,
        document.body
      )}
    </>
  );
}
