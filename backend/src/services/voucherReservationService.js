const mongoose = require("mongoose");
const Order = require("../models/Order");
const Voucher = require("../models/Voucher");
const VoucherRedemption = require("../models/VoucherRedemption");

const PUBLIC_VOUCHER_LIMIT = 50;

function normalizeSubtotal(subtotal) {
  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount < 0) {
    const error = new Error("Subtotal không hợp lệ");
    error.status = 400;
    throw error;
  }
  return amount;
}

function calculateDiscount(voucher, subtotal, shippingFee = 0) {
  const baseAmount = voucher.scope === "shipping" ? shippingFee : subtotal;
  let discount =
    voucher.type === "percent"
      ? Math.floor((baseAmount * voucher.value) / 100)
      : voucher.value;
  if (voucher.maxDiscount > 0 && discount > voucher.maxDiscount) {
    discount = voucher.maxDiscount;
  }
  return Math.min(discount, baseAmount);
}

async function getUserVoucherUsage(voucherId, userId, session = null) {
  if (!userId) return 0;
  const ledgerQuery = VoucherRedemption.findOne({
    voucher: voucherId,
    user: userId,
  }).select("usageCount");
  if (session) ledgerQuery.session(session);
  const ledger = await ledgerQuery;
  if (ledger) return ledger.usageCount;

  const legacyQuery = Order.countDocuments({
    user: userId,
    voucherReleasedAt: null,
    $or: [
      { "voucher.voucherId": voucherId },
      { "shippingVoucher.voucherId": voucherId },
    ],
  });
  if (session) legacyQuery.session(session);
  return legacyQuery;
}

async function applyVoucher(
  code,
  subtotal,
  {
    session = null,
    userId = null,
    shippingFee = 0,
    allowPendingShipping = false,
  } = {}
) {
  if (!code) return { discountAmount: 0, voucher: null };
  const normalizedSubtotal = normalizeSubtotal(subtotal);
  const query = Voucher.findOne({ code: code.toUpperCase(), active: true });
  if (session) query.session(session);
  const voucher = await query;
  if (!voucher) throw new Error("Voucher không tồn tại hoặc đã ngừng");

  const now = new Date();
  if (now < voucher.startAt || now >= voucher.endAt) {
    throw new Error("Voucher không trong thời gian hiệu lực");
  }
  if (voucher.usedCount >= voucher.usageLimit) {
    throw new Error("Voucher đã hết lượt sử dụng");
  }
  if (normalizedSubtotal < voucher.minOrder) {
    throw new Error(`Đơn hàng tối thiểu ${voucher.minOrder.toLocaleString()}đ`);
  }
  if (userId) {
    const userUsage = await getUserVoucherUsage(voucher._id, userId, session);
    if (userUsage >= voucher.perUserLimit) {
      throw new Error("Bạn đã sử dụng hết số lượt của voucher này");
    }
  }

  const normalizedShippingFee = normalizeSubtotal(shippingFee);
  if (
    voucher.scope === "shipping" &&
    normalizedShippingFee <= 0 &&
    !allowPendingShipping
  ) {
    throw new Error("Đơn hàng không có phí vận chuyển để áp dụng voucher này");
  }
  const discount = calculateDiscount(voucher, normalizedSubtotal, normalizedShippingFee);

  return {
    discountAmount: discount,
    voucher: {
      voucherId: voucher._id,
      code: voucher.code,
      type: voucher.type,
      scope: voucher.scope,
      value: voucher.value,
      discountAmount: discount,
      perUserLimit: voucher.perUserLimit,
    },
  };
}

async function getAvailablePublicVouchers(
  subtotal,
  { userId = null, shippingFee = 0 } = {}
) {
  const normalizedSubtotal = normalizeSubtotal(subtotal);
  const normalizedShippingFee = normalizeSubtotal(shippingFee);
  const now = new Date();
  const vouchers = await Voucher.find({
    publicVisible: true,
    active: true,
    startAt: { $lte: now },
    endAt: { $gt: now },
    minOrder: { $lte: normalizedSubtotal },
    $expr: { $lt: ["$usedCount", "$usageLimit"] },
  })
    .select(
      "code type scope value minOrder maxDiscount endAt description perUserLimit"
    )
    .lean();

  let eligibleVouchers = vouchers;
  if (userId && vouchers.length > 0) {
    const normalizedUserId =
      userId instanceof mongoose.Types.ObjectId
        ? userId
        : new mongoose.Types.ObjectId(String(userId));
    const voucherIds = vouchers.map((voucher) => voucher._id);
    const [ledgers, legacyUsages] = await Promise.all([
      VoucherRedemption.find({
        voucher: { $in: voucherIds },
        user: normalizedUserId,
      })
        .select("voucher usageCount")
        .lean(),
      Order.aggregate([
        {
          $match: {
            user: normalizedUserId,
            voucherReleasedAt: null,
            $or: [
              { "voucher.voucherId": { $in: voucherIds } },
              { "shippingVoucher.voucherId": { $in: voucherIds } },
            ],
          },
        },
        {
          $project: {
            voucherIds: ["$voucher.voucherId", "$shippingVoucher.voucherId"],
          },
        },
        { $unwind: "$voucherIds" },
        { $match: { voucherIds: { $ne: null } } },
        {
          $group: {
            _id: "$voucherIds",
            usageCount: { $sum: 1 },
          },
        },
      ]),
    ]);
    const ledgerByVoucher = new Map(
      ledgers.map((entry) => [String(entry.voucher), entry.usageCount])
    );
    const legacyByVoucher = new Map(
      legacyUsages.map((entry) => [String(entry._id), entry.usageCount])
    );

    eligibleVouchers = vouchers.filter((voucher) => {
      const key = String(voucher._id);
      const usage = ledgerByVoucher.has(key)
        ? ledgerByVoucher.get(key)
        : legacyByVoucher.get(key) || 0;
      return usage < voucher.perUserLimit;
    });
  }

  return eligibleVouchers
    .map((voucher) => ({
      code: voucher.code,
      type: voucher.type,
      scope: voucher.scope,
      value: voucher.value,
      minOrder: voucher.minOrder,
      maxDiscount: voucher.maxDiscount,
      endAt: voucher.endAt,
      description: voucher.description,
      discountAmount: calculateDiscount(voucher, normalizedSubtotal, normalizedShippingFee),
    }))
    .sort(
      (left, right) =>
        right.discountAmount - left.discountAmount ||
        new Date(left.endAt) - new Date(right.endAt) ||
        left.code.localeCompare(right.code)
    )
    .slice(0, PUBLIC_VOUCHER_LIMIT);
}

async function consumeVoucher(voucher, userId, session = null) {
  const voucherId = voucher.voucherId || voucher._id || voucher;
  const perUserLimit = Number(voucher.perUserLimit) || 1;
  const now = new Date();
  const consumed = await Voucher.updateOne(
    {
      _id: voucherId,
      active: true,
      startAt: { $lte: now },
      endAt: { $gt: now },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    },
    { $inc: { usedCount: 1 } },
    session ? { session } : undefined
  );
  if (consumed.modifiedCount !== 1) {
    throw new Error("Voucher đã hết lượt sử dụng");
  }

  const existingUsage = await getUserVoucherUsage(voucherId, userId, session);
  try {
    await VoucherRedemption.updateOne(
      { voucher: voucherId, user: userId },
      { $setOnInsert: { usageCount: existingUsage } },
      { upsert: true, ...(session ? { session } : {}) }
    );
  } catch (error) {
    if (error.code === 11000) {
      const limitError = new Error("Bạn đã sử dụng hết số lượt của voucher này");
      limitError.code = "VOUCHER_USER_LIMIT";
      throw limitError;
    }
    throw error;
  }
  const reserved = await VoucherRedemption.updateOne(
    {
      voucher: voucherId,
      user: userId,
      usageCount: { $lt: perUserLimit },
    },
    { $inc: { usageCount: 1 } },
    session ? { session } : undefined
  );
  if (reserved.modifiedCount !== 1) {
    const error = new Error("Bạn đã sử dụng hết số lượt của voucher này");
    error.code = "VOUCHER_USER_LIMIT";
    throw error;
  }
}

async function refundVoucher(selector, userId, session = null) {
  if (!selector) return;
  const voucherQuery = Voucher.findOne(selector).select("_id");
  if (session) voucherQuery.session(session);
  const voucher = await voucherQuery;
  if (!voucher) return;
  await Voucher.updateOne(
    { _id: voucher._id, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    session ? { session } : undefined
  );
  if (userId) {
    await VoucherRedemption.updateOne(
      { voucher: voucher._id, user: userId, usageCount: { $gt: 0 } },
      { $inc: { usageCount: -1 } },
      session ? { session } : undefined
    );
  }
}

async function releaseOrderVoucher(order, session) {
  if ((!order.voucher && !order.shippingVoucher) || order.voucherReleasedAt) return;
  for (const voucher of [order.voucher, order.shippingVoucher]) {
    if (!voucher) continue;
    const selector = voucher.voucherId
      ? { _id: voucher.voucherId }
      : voucher.code
        ? { code: voucher.code }
        : null;
    if (selector) await refundVoucher(selector, order.user, session);
  }
  order.voucherReleasedAt = new Date();
}

module.exports = {
  applyVoucher,
  consumeVoucher,
  getAvailablePublicVouchers,
  getUserVoucherUsage,
  refundVoucher,
  releaseOrderVoucher,
};
