const Notification = require("../models/Notification");

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

function notifyUser(userId, payload, appOrReq = null) {
  if (!userId) return Promise.resolve(null);
  return createNotification({ ...payload, user: userId, role: "user" }, appOrReq);
}

function notifyAdmins(payload, appOrReq = null) {
  return createNotification({ ...payload, role: "admin" }, appOrReq);
}

function sendEmail({ to, subject, text }) {
  if (!process.env.SMTP_HOST) {
    console.log(`[email:mock] ${to || "unknown"} | ${subject} | ${text || ""}`);
    return Promise.resolve({ mocked: true });
  }

  console.log(`[email:pending-smtp] ${to || "unknown"} | ${subject}`);
  return Promise.resolve({ skipped: true });
}

module.exports = {
  createNotification,
  notifyAdmins,
  notifyUser,
  sendEmail,
};
