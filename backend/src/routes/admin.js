const express = require("express");
const Order = require("../models/Order");
const Book = require("../models/Book");
const User = require("../models/User");
const Category = require("../models/Category");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

// All routes require admin authentication
router.use(auth, adminOnly);

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

// PATCH /api/admin/orders/:id/status - Update order status
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "completed",
      "cancelled",
    ];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ",
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("user", "name email");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    res.json({
      success: true,
      message: `Cập nhật trạng thái thành ${status}`,
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

// GET /api/admin/stats - Dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const [orderStats, books, users] = await Promise.all([
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
    ]);

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
