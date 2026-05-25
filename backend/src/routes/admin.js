const express = require("express");
const Order = require("../models/Order");
const Book = require("../models/Book");
const User = require("../models/User");
const Category = require("../models/Category");
const orderService = require("../services/orderService");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

// All routes require admin authentication
router.use(auth, adminOnly);

const REVENUE_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

function getMonthRange(baseDate = new Date(), offset = 0) {
  const start = new Date(baseDate);
  start.setMonth(start.getMonth() + offset, 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function toPercentChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// GET /api/admin/orders - Get all orders
router.get("/orders", async (req, res) => {
  try {
    const { status, page, limit } = req.query;

    let query = Order.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    if (status) {
      query = query.where("status").equals(status);
    }

    const orders = await query;
    const stats = await Order.getStats();

    res.json({
      success: true,
      data: {
        orders: orders.map((o) => ({ ...o.toObject(), id: o._id })),
        stats,
        pagination: {
          total: orders.length,
          page: parseInt(page) || 1,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// GET /api/admin/orders/:id - Get single order
router.get("/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    res.json({
      success: true,
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// POST /api/admin/orders/:id/confirm - Duyệt đơn sang PROCESSING
router.post("/orders/:id/confirm", async (req, res) => {
  try {
    const order = await orderService.adminApproveOrder(
      req.params.id,
      req.user._id
    );
    res.json({
      success: true,
      message: "Đã xác nhận đơn hàng",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/admin/orders/:id/ship - PROCESSING → SHIPPED
router.post("/orders/:id/ship", async (req, res) => {
  try {
    const order = await orderService.adminMarkShipped(
      req.params.id,
      req.user._id
    );
    res.json({
      success: true,
      message: "Đã chuyển sang vận chuyển",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/admin/orders/:id/deliver - SHIPPED → DELIVERED
router.post("/orders/:id/deliver", async (req, res) => {
  try {
    const order = await orderService.adminMarkDelivered(
      req.params.id,
      req.user._id
    );
    res.json({
      success: true,
      message: "Đã giao hàng thành công",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Back-compat: PATCH /api/admin/orders/:id/status - route by desired status
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const map = {
      PROCESSING: orderService.adminApproveOrder,
      SHIPPED: orderService.adminMarkShipped,
      DELIVERED: orderService.adminMarkDelivered,
    };
    const fn = map[status];
    if (!fn) {
      return res.status(400).json({
        success: false,
        message:
          "Chỉ hỗ trợ transition PROCESSING/SHIPPED/DELIVERED qua endpoint này",
      });
    }
    const order = await fn(req.params.id, req.user._id);
    res.json({
      success: true,
      message: `Cập nhật trạng thái thành ${status}`,
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/admin/stats - Dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = getMonthRange(now, 0);
    const previousMonth = getMonthRange(now, -1);

    const [orderStats, books, users, monthOrders, monthUsers, monthSold] =
      await Promise.all([
      Order.getStats(),
      Book.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalStock: { $sum: "$stock" },
            totalSold: { $sum: "$sold" },
          },
        },
      ]),
      User.countDocuments(),
      Promise.all([
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: currentMonth.start, $lte: currentMonth.end },
              status: { $in: REVENUE_STATUSES },
            },
          },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
            },
          },
        ]),
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: previousMonth.start, $lte: previousMonth.end },
              status: { $in: REVENUE_STATUSES },
            },
          },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
            },
          },
        ]),
      ]),
      Promise.all([
        User.countDocuments({
          createdAt: { $gte: currentMonth.start, $lte: currentMonth.end },
        }),
        User.countDocuments({
          createdAt: { $gte: previousMonth.start, $lte: previousMonth.end },
        }),
      ]),
      Promise.all([
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: currentMonth.start, $lte: currentMonth.end },
              status: { $in: REVENUE_STATUSES },
            },
          },
          { $unwind: "$items" },
          { $group: { _id: null, sold: { $sum: "$items.quantity" } } },
        ]),
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: previousMonth.start, $lte: previousMonth.end },
              status: { $in: REVENUE_STATUSES },
            },
          },
          { $unwind: "$items" },
          { $group: { _id: null, sold: { $sum: "$items.quantity" } } },
        ]),
      ]),
    ]);

    const revenueCurrent = monthOrders[0][0]?.revenue || 0;
    const revenuePrevious = monthOrders[1][0]?.revenue || 0;
    const ordersCurrent = monthOrders[0][0]?.orders || 0;
    const ordersPrevious = monthOrders[1][0]?.orders || 0;

    const usersCurrent = monthUsers[0] || 0;
    const usersPrevious = monthUsers[1] || 0;

    const soldCurrent = monthSold[0][0]?.sold || 0;
    const soldPrevious = monthSold[1][0]?.sold || 0;

    res.json({
      success: true,
      data: {
        books: {
          total: books[0]?.total || 0,
          totalStock: books[0]?.totalStock || 0,
          totalSold: books[0]?.totalSold || 0,
        },
        orders: orderStats,
        users,
        monthOverMonth: {
          revenue: toPercentChange(revenueCurrent, revenuePrevious),
          orders: toPercentChange(ordersCurrent, ordersPrevious),
          users: toPercentChange(usersCurrent, usersPrevious),
          soldBooks: toPercentChange(soldCurrent, soldPrevious),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

module.exports = router;
