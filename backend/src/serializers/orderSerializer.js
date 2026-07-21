function serializeCustomerOrder(order) {
  const obj = order?.toObject ? order.toObject() : { ...order };
  const payment = obj.payment
    ? {
        method: obj.payment.method,
        status: obj.payment.status,
        transactionId: obj.payment.transactionId,
        paidAt: obj.payment.paidAt,
        refundedAt: obj.payment.refundedAt,
      }
    : undefined;
  const voucher = obj.voucher
    ? {
        code: obj.voucher.code,
        type: obj.voucher.type,
        scope: obj.voucher.scope || "order",
        value: obj.voucher.value,
        discountAmount: obj.voucher.discountAmount,
      }
    : null;
  const shippingVoucher = obj.shippingVoucher
    ? {
        code: obj.shippingVoucher.code,
        type: obj.shippingVoucher.type,
        scope: "shipping",
        value: obj.shippingVoucher.value,
        discountAmount: obj.shippingVoucher.discountAmount,
      }
    : null;

  return {
    _id: obj._id,
    id: obj._id,
    orderCode: obj.orderCode,
    items: obj.items || [],
    subtotal: obj.subtotal,
    discountAmount: obj.discountAmount,
    shippingDiscountAmount:
      obj.shippingDiscountAmount ||
      (obj.voucher?.scope === "shipping" ? obj.discountAmount : 0),
    shippingFee: obj.shippingFee,
    pointsRedeemed: obj.pointsRedeemed || 0,
    pointsDiscountAmount: obj.pointsDiscountAmount || 0,
    pointsEarned: obj.pointsEarned || 0,
    totalAmount: obj.totalAmount,
    voucher,
    shippingVoucher,
    status: obj.status,
    shippingAddress: obj.shippingAddress,
    shippingMethod: obj.shippingMethod,
    note: obj.note,
    carrier: obj.carrier,
    trackingNumber: obj.trackingNumber,
    estimatedDelivery: obj.estimatedDelivery,
    trackingEvents: obj.trackingEvents || [],
    shipment: obj.shipment
      ? {
          provider: obj.shipment.provider,
          environment: obj.shipment.environment,
          quoteId: obj.shipment.quoteId,
          serviceName: obj.shipment.serviceName,
          quotedFee: obj.shipment.quotedFee,
          providerOrderCode: obj.shipment.providerOrderCode,
          providerStatus: obj.shipment.providerStatus,
          externalCreatedAt: obj.shipment.externalCreatedAt,
          cancelledAt: obj.shipment.cancelledAt,
          lastWebhookAt: obj.shipment.lastWebhookAt,
        }
      : null,
    payment,
    expiresAt: obj.expiresAt,
    placedAt: obj.placedAt,
    paidAt: obj.paidAt,
    processingAt: obj.processingAt,
    shippedAt: obj.shippedAt,
    deliveredAt: obj.deliveredAt,
    cancelledAt: obj.cancelledAt,
    refundedAt: obj.refundedAt,
    cancelReason: obj.cancelReason,
    history: obj.history || [],
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

module.exports = { serializeCustomerOrder };
