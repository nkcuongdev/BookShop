const express = require("express");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const { parsePositiveInt } = require("../utils/security");
const roleRegistry = require("../services/roleRegistry");
const {
  NOTIFICATION_TYPES,
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
} = require("../utils/notificationPreferences");

const router = express.Router();

router.use(auth);

/**
 * Which broadcasts this user may see. Reads the role table, so resolve it once
 * per request and hand the result to the pure filter builders below.
 */
async function resolveRoleFilters(user) {
  const filters = [{ role: "all", user: null }];
  if (user.role === "admin") {
    // Admins keep seeing every staff broadcast, including role-targeted ones.
    filters.push({ role: { $in: await roleRegistry.staffRoles() }, user: null });
  } else if (await roleRegistry.isStaffRole(user.role)) {
    filters.push({ role: user.role, user: null });
  }
  return filters;
}

function visibleFilter(user, roleFilters) {
  return { $or: [{ user: user._id }, ...roleFilters] };
}

function unreadFilter(user, roleFilters) {
  return {
    $or: [
      { user: user._id, readAt: null },
      ...roleFilters.map((filter) => ({
        ...filter,
        readBy: { $ne: user._id },
      })),
    ],
  };
}

function readFilter(user, roleFilters) {
  return {
    $or: [
      { user: user._id, readAt: { $type: "date" } },
      ...roleFilters.map((filter) => ({
        ...filter,
        readBy: user._id,
      })),
    ],
  };
}

function serializeNotification(notification, userId) {
  const obj = notification.toObject ? notification.toObject() : notification;
  const isRoleNotification = !obj.user;
  const readByUser = (obj.readBy || []).some((id) => String(id) === String(userId));
  delete obj.readBy;
  return {
    ...obj,
    id: obj._id,
    readAt: isRoleNotification
      ? readByUser
        ? obj.updatedAt || obj.createdAt
        : null
      : obj.readAt,
  };
}

router.get("/preferences", async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("notificationPreferences emailVerifiedAt")
      .lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    }
    return res.json({
      success: true,
      data: {
        preferences: normalizeNotificationPreferences(user.notificationPreferences),
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    });
  } catch {
    return res.status(500).json({ success: false, message: "Không thể tải tùy chọn thông báo" });
  }
});

router.patch("/preferences", async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "notificationPreferences emailVerifiedAt"
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
    }
    const preferences = mergeNotificationPreferences(
      user.notificationPreferences?.toObject?.() || user.notificationPreferences,
      req.body
    );
    if (!user.emailVerifiedAt) {
      const requestedEmail = req.body?.email;
      if (
        requestedEmail &&
        typeof requestedEmail === "object" &&
        Object.values(requestedEmail).some((enabled) => enabled === true)
      ) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng xác minh email trước khi bật thông báo qua email",
        });
      }
      for (const type of Object.keys(preferences.email)) {
        preferences.email[type] = false;
      }
    }
    user.notificationPreferences = preferences;
    await user.save();
    return res.json({ success: true, data: { preferences } });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.statusCode ? error.message : "Không thể lưu tùy chọn thông báo",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 50);
    const type = String(req.query.type || "all");
    const readState = String(req.query.read || "all");
    if (type !== "all" && !NOTIFICATION_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Loại thông báo không hợp lệ" });
    }
    if (!["all", "read", "unread"].includes(readState)) {
      return res.status(400).json({ success: false, message: "Trạng thái thông báo không hợp lệ" });
    }

    const roleFilters = await resolveRoleFilters(req.user);
    const filters = [visibleFilter(req.user, roleFilters)];
    if (type !== "all") filters.push({ type });
    if (readState === "read") filters.push(readFilter(req.user, roleFilters));
    if (readState === "unread") filters.push(unreadFilter(req.user, roleFilters));
    const filter = filters.length === 1 ? filters[0] : { $and: filters };

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        $and: [
          visibleFilter(req.user, roleFilters),
          unreadFilter(req.user, roleFilters),
        ],
      }),
    ]);
    return res.json({
      success: true,
      data: {
        notifications: notifications.map((notification) =>
          serializeNotification(notification, req.user._id)
        ),
        unreadCount,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch {
    return res.status(500).json({ success: false, message: "Không thể tải thông báo" });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    const roleFilters = await resolveRoleFilters(req.user);
    await Promise.all([
      Notification.updateMany(
        { user: req.user._id, readAt: null },
        { $set: { readAt: new Date() } }
      ),
      Notification.updateMany(
        { $or: roleFilters, readBy: { $ne: req.user._id } },
        { $addToSet: { readBy: req.user._id } }
      ),
    ]);
    return res.json({ success: true });
  } catch {
    return res.status(400).json({ success: false, message: "Không thể cập nhật thông báo" });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      ...visibleFilter(req.user, await resolveRoleFilters(req.user)),
    });
    if (!notification) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông báo" });
    }

    if (notification.user) notification.readAt = notification.readAt || new Date();
    else notification.readBy.addToSet(req.user._id);
    await notification.save();

    return res.json({
      success: true,
      data: { notification: serializeNotification(notification, req.user._id) },
    });
  } catch {
    return res.status(400).json({ success: false, message: "Không thể cập nhật thông báo" });
  }
});

module.exports = router;
