const express = require("express");
const User = require("../models/User");
const Order = require("../models/Order");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(auth, adminOnly);

/**
 * Normalize DB role ('user'/'admin') to UI role ('customer'/'admin').
 * UI & schema elsewhere use 'customer' for non-admin accounts.
 */
const toUiRole = (role) => (role === "admin" ? "admin" : "customer");
const toDbRole = (role) => (role === "admin" ? "admin" : "user");

const serialize = (u, stats = {}) => {
  const obj = u.toObject ? u.toObject() : u;
  return {
    _id: obj._id,
    id: obj._id,
    name: obj.name,
    email: obj.email,
    phone: obj.phone || "",
    role: toUiRole(obj.role),
    status: obj.status || "active",
    avatar: obj.avatar || "",
    ordersCount: stats.ordersCount || 0,
    totalSpend: stats.totalSpend || 0,
    createdAt: obj.createdAt,
  };
};

// GET /api/admin/users
router.get("/", async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const query = {};

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }
    if (role && role !== "all") query.role = toDbRole(role);
    if (status && status !== "all") query.status = status;

    const users = await User.find(query).sort({ createdAt: -1 });

    // Aggregate order counts / spend per user in one pass
    const userIds = users.map((u) => u._id);
    const stats = await Order.aggregate([
      { $match: { user: { $in: userIds } } },
      {
        $group: {
          _id: "$user",
          ordersCount: { $sum: 1 },
          totalSpend: { $sum: "$totalAmount" },
        },
      },
    ]);
    const statsById = Object.fromEntries(
      stats.map((s) => [String(s._id), s])
    );

    res.json({
      success: true,
      data: {
        users: users.map((u) => serialize(u, statsById[String(u._id)] || {})),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PATCH /api/admin/users/:id/role  { role: 'admin' | 'customer' }
router.patch("/:id/role", async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!role) {
      return res.status(400).json({ success: false, message: "Thiếu role" });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: toDbRole(role) },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });
    }
    res.json({ success: true, data: { user: serialize(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PATCH /api/admin/users/:id/status  { status: 'active' | 'banned' }
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["active", "banned"].includes(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
    }

    // Prevent banning self
    if (String(req.user._id) === String(req.params.id) && status === "banned") {
      return res.status(400).json({
        success: false,
        message: "Không thể cấm chính mình",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });
    }
    res.json({ success: true, data: { user: serialize(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/:id", async (req, res) => {
  try {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Không thể xoá chính mình",
      });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });
    }
    res.json({ success: true, message: "Đã xoá" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

module.exports = router;
