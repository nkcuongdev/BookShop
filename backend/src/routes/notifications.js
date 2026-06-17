const express = require("express");
const Notification = require("../models/Notification");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

function baseFilter(user) {
  const filters = [{ user: user._id }];
  if (user.role === "admin") filters.push({ role: "admin" }, { role: "all" });
  return { $or: filters };
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = baseFilter(req.user);
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
      Notification.countDocuments({ ...filter, readAt: null }),
    ]);
    res.json({
      success: true,
      data: {
        notifications: notifications.map((n) => ({ ...n.toObject(), id: n._id })),
        unreadCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...baseFilter(req.user) },
      { readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.json({ success: true, data: { notification } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(baseFilter(req.user), { readAt: new Date() });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
