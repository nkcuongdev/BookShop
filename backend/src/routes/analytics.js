const express = require("express");
const Order = require("../models/Order");
const Book = require("../models/Book");
const Review = require("../models/Review");
const User = require("../models/User");
const Voucher = require("../models/Voucher");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(auth, adminOnly);

/**
 * GET /api/admin/analytics/revenue-series?days=30
 * Returns daily revenue + order count over last N days (fills zero-days).
 */
router.get("/revenue-series", async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));
    const tz = process.env.ANALYTICS_TIMEZONE || "Asia/Ho_Chi_Minh";
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const agg = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: tz,
            },
          },
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
    ]);

    const byDate = Object.fromEntries(agg.map((a) => [a._id, a]));
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
      const label = new Intl.DateTimeFormat("vi-VN", {
        timeZone: tz,
        day: "2-digit",
        month: "2-digit",
      }).format(d);
      const row = byDate[key];
      series.push({
        date: key,
        label,
        revenue: row?.revenue || 0,
        orders: row?.orders || 0,
      });
    }

    res.json({ success: true, data: { series } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

/**
 * GET /api/admin/analytics/category-share
 * Revenue percentage by category (top 5, lumps the rest as "Khác").
 */
router.get("/category-share", async (req, res) => {
  try {
    const rows = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" } } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "books",
          localField: "items.book",
          foreignField: "_id",
          as: "book",
        },
      },
      { $unwind: { path: "$book", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$book.category",
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const total = rows.reduce((sum, r) => sum + (r.revenue || 0), 0) || 1;
    const top = rows.slice(0, 5);
    const rest = rows.slice(5).reduce((s, r) => s + (r.revenue || 0), 0);

    const share = top.map((r) => ({
      name: r._id || "Khác",
      value: Math.round((r.revenue / total) * 100),
    }));
    if (rest > 0) {
      share.push({ name: "Khác", value: Math.round((rest / total) * 100) });
    }

    res.json({ success: true, data: { share } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

/**
 * GET /api/admin/analytics/activity
 * Latest 10 events from orders, reviews, user sign-ups, low stock, voucher usage.
 */
router.get("/activity", async (req, res) => {
  try {
    const [orders, reviews, users, lowStock, vouchers] = await Promise.all([
      Order.find()
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Review.find()
        .populate("book", "title")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      User.find().sort({ createdAt: -1 }).limit(5).lean(),
      Book.find({ stock: { $gt: 0, $lte: 5 } })
        .sort({ updatedAt: -1 })
        .limit(3)
        .lean(),
      Voucher.find({ usedCount: { $gt: 0 } })
        .sort({ updatedAt: -1 })
        .limit(3)
        .lean(),
    ]);

    const items = [];
    orders.forEach((o) =>
      items.push({
        type: "order",
        text: `Đơn mới #${String(o._id).slice(-5).toUpperCase()} từ ${
          o.user?.name || "Khách"
        }`,
        at: o.createdAt,
      })
    );
    reviews.forEach((r) =>
      items.push({
        type: "review",
        text: `Đánh giá ${r.rating} sao cho '${r.book?.title || "sách"}'`,
        at: r.createdAt,
      })
    );
    users.forEach((u) =>
      items.push({
        type: "user",
        text: `Người dùng mới đăng ký: ${u.email}`,
        at: u.createdAt,
      })
    );
    lowStock.forEach((b) =>
      items.push({
        type: "stock",
        text: `'${b.title}' còn ${b.stock} cuốn (sắp hết)`,
        at: b.updatedAt,
      })
    );
    vouchers.forEach((v) =>
      items.push({
        type: "voucher",
        text: `Voucher ${v.code} được sử dụng`,
        at: v.updatedAt,
      })
    );

    items.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ success: true, data: { items: items.slice(0, 10) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

/**
 * GET /api/admin/analytics/funnel
 * Rough conversion funnel: views -> add-to-cart -> checkout -> completed.
 *
 * Since we don't track views/carts server-side, we estimate:
 *   - Lượt xem    = totalSold * 10 (heuristic)
 *   - Thêm giỏ    = totalSold * 3
 *   - Thanh toán  = total orders
 *   - Hoàn tất    = orders with status in ['completed', 'delivered']
 */
router.get("/funnel", async (req, res) => {
  try {
    const [soldAgg, ordersTotal, completedTotal] = await Promise.all([
      Book.aggregate([
        { $group: { _id: null, sold: { $sum: "$sold" } } },
      ]),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ["completed", "delivered"] } }),
    ]);
    const sold = soldAgg[0]?.sold || 0;
    const stages = [
      { stage: "Lượt xem", value: sold * 10 },
      { stage: "Thêm giỏ", value: sold * 3 },
      { stage: "Thanh toán", value: ordersTotal },
      { stage: "Hoàn tất", value: completedTotal },
    ];
    res.json({ success: true, data: { stages } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

module.exports = router;
