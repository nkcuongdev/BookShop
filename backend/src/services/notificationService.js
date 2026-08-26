const Notification = require("../models/Notification");
const Order = require("../models/Order");
const User = require("../models/User");
const roleRegistry = require("./roleRegistry");
const {
  sendNotificationEmail,
  sendOrderLifecycleEmail,
} = require("./emailService");
const {
  NOTIFICATION_TYPES,
  normalizeNotificationPreferences,
} = require("../utils/notificationPreferences");

const ORDER_LIFECYCLE_TYPES = new Set([
  "order",
  "payment",
  "shipping",
  "refund",
]);

function resolveIo(appOrReq) {
  const app = appOrReq?.app || appOrReq;
  return typeof app?.get === "function" ? app.get("io") : null;
}

async function createNotification(payload, appOrReq = null) {
  const notification = await Notification.create(payload);
  const io = resolveIo(appOrReq);
  if (io) {
    if (notification.user) {
      io.to(`user:${notification.user}`).emit("notification:new", notification);
    }
    if (notification.role && notification.role !== "user") {
      io.to(`role:${notification.role}`).emit("notification:new", notification);
    }
  }
  return notification;
}

async function notifyUser(userId, payload, appOrReq = null) {
  if (!userId) return null;
  const user = await User.findById(userId)
    .select("name email emailVerifiedAt notificationPreferences status")
    .lean();
  if (!user || user.status === "banned") return null;

  const type = NOTIFICATION_TYPES.includes(payload.type) ? payload.type : "system";
  const preferences = normalizeNotificationPreferences(user.notificationPreferences);
  const normalizedPayload = { ...payload, type };
  const notification = preferences.inApp[type]
    ? await createNotification(
        { ...normalizedPayload, user: userId, role: "user" },
        appOrReq
      )
    : null;

  if (preferences.email[type] && user.emailVerifiedAt) {
    if (ORDER_LIFECYCLE_TYPES.has(type) && payload.metadata?.orderId) {
      const order = await Order.findById(payload.metadata.orderId)
        .select(
          "orderCode items.title items.quantity items.price items.subtotal totalAmount payment.method carrier trackingNumber"
        )
        .lean()
        .catch(() => null);
      await sendOrderLifecycleEmail(
        user.email,
        normalizedPayload,
        order || {},
        user.name
      ).catch(() => null);
    } else {
      await sendNotificationEmail(user.email, normalizedPayload).catch(() => null);
    }
  }
  return notification;
}

function notifyAdmins(payload, appOrReq = null) {
  return createNotification({ ...payload, role: "admin" }, appOrReq);
}

/**
 * Broadcast to one staff role (e.g. low stock -> warehouse). The Notification
 * schema no longer constrains `role` to an enum, so this is the check that
 * keeps a typo from creating a broadcast nobody can ever see.
 */
async function notifyRole(role, payload, appOrReq = null) {
  if (!(await roleRegistry.isStaffRole(role))) return null;
  return createNotification({ ...payload, role }, appOrReq);
}

module.exports = {
  createNotification,
  notifyAdmins,
  notifyRole,
  notifyUser,
};
