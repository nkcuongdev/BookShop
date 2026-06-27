const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const Review = require("../models/Review");
const Post = require("../models/Post");
const Cart = require("../models/Cart");
const AuthSession = require("../models/AuthSession");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const PromotionAlertDelivery = require("../models/PromotionAlertDelivery");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const VoucherRedemption = require("../models/VoucherRedemption");
const { auth, requirePermission } = require("../middleware/auth");
const { DEFAULT_ROLE } = require("../config/permissions");
const roleRegistry = require("../services/roleRegistry");
const { safeRegex, parsePositiveInt } = require("../utils/security");
const { revokeAllSessions } = require("../services/authService");
const auditLogService = require("../services/auditLogService");
const { FIELD_LABELS } = require("../services/auditLogPresenter");

const router = express.Router();

/**
 * The UI calls customer accounts 'customer' while the DB stores 'user'; every
 * other role uses the same key on both sides. This alias is the only fixed
 * mapping — which keys are valid comes from the role registry.
 */
const toUiRole = (role) => (role === DEFAULT_ROLE || !role ? "customer" : role);
const normalizeRoleInput = (role) => {
  const value = String(role || "").trim().toLowerCase();
  return value === "customer" ? DEFAULT_ROLE : value;
};

/** Resolve a requested role to a stored key, or null if no such role exists. */
async function toDbRole(role) {
  const value = normalizeRoleInput(role);
  if (!value) return null;
  return (await roleRegistry.roleExists(value)) ? value : null;
}

const serialize = (u, stats = {}, labels = {}) => {
  const obj = u.toObject ? u.toObject() : u;
  return {
    _id: obj._id,
    id: obj._id,
    name: obj.name,
    email: obj.email,
    phone: obj.phone || "",
    role: toUiRole(obj.role),
    roleLabel: labels[obj.role] || obj.role,
    status: obj.status || "active",
    avatar: obj.avatar || "",
    ordersCount: stats.ordersCount || 0,
    totalSpend: stats.totalSpend || 0,
    createdAt: obj.createdAt,
  };
};

// GET /api/admin/users/lookup?q=... -- limited customer lookup for support.
// This route deliberately precedes the user-management gate so customer.read
// is useful without granting account administration.
router.get("/lookup", auth, requirePermission("customer.read"), async (req, res, next) => {
  try {
    const search = safeRegex(req.query.q);
    if (!search) {
      return res.json({ success: true, data: { users: [] } });
    }
    const users = await User.find({
      role: DEFAULT_ROLE,
      status: { $ne: "banned" },
      $or: [{ name: search }, { email: search }, { phone: search }],
    })
      .select("name email phone avatar")
      .sort({ name: 1, _id: 1 })
      .limit(20)
      .lean();
    return res.json({ success: true, data: { users } });
  } catch (error) {
    return next(error);
  }
});

router.use(auth);

// GET /api/admin/users
router.get("/", requirePermission("user.manage"), async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const query = {};

    if (search) {
      const regex = safeRegex(search);
      if (regex) query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }
    if (role && role !== "all") {
      const dbRole = await toDbRole(role);
      if (!dbRole) {
        return res.status(400).json({ success: false, code: "INVALID_ROLE", message: "Vai trò không hợp lệ" });
      }
      query.role = dbRole;
    }
    if (status && status !== "all") {
      if (!["active", "banned"].includes(status)) {
        return res.status(400).json({ success: false, code: "INVALID_STATUS", message: "Trạng thái không hợp lệ" });
      }
      query.status = status;
    }

    const labels = await roleRegistry.roleLabels();
    const [users, total] = await Promise.all([
      User.find(query)
        .select("name email phone role status avatar createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Aggregate order counts / spend per user in one pass. String conversion keeps
    // this working with both ObjectId refs and legacy string user ids.
    const userIds = users.map((u) => u._id);
    const stats = await Order.aggregate([
      { $match: { user: { $in: userIds } } },
      {
        $group: {
          _id: "$user",
          ordersCount: { $sum: 1 },
          totalSpend: {
            $sum: {
              $cond: [
                { $eq: ["$payment.status", "PAID"] },
                { $ifNull: ["$totalAmount", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);
    const statsById = Object.fromEntries(
      stats.map((s) => [String(s._id), s])
    );

    res.json({
      success: true,
      data: {
        users: users.map((u) =>
          serialize(u, statsById[String(u._id)] || {}, labels)
        ),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PATCH /api/admin/users/:id/role  { role: 'admin' | 'customer' | staff role }
router.patch("/:id/role", requirePermission("user.role.assign"), async (req, res) => {
  try {
    const { role } = req.body || {};
    const dbRole = await toDbRole(role);
    if (!dbRole) {
      const valid = [...(await roleRegistry.allRoleKeys()), "customer"]
        .filter((key) => key !== DEFAULT_ROLE)
        .join(", ");
      return res.status(400).json({
        success: false,
        code: "INVALID_ROLE",
        message: `Vai trò phải là một trong: ${valid}`,
      });
    }
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({
        success: false,
        code: "SELF_ROLE_CHANGE",
        message: "Không thể tự thay đổi vai trò của chính mình",
      });
    }

    // A delegated role administrator must not assign a role stronger than
    // their own. In particular, only the wildcard admin can assign `admin`.
    const [actorPermissions, targetPermissions] = await Promise.all([
      roleRegistry.permissionsForRole(req.user.role),
      roleRegistry.permissionsForRole(dbRole),
    ]);
    const actorHasWildcard = actorPermissions.includes("*");
    const unassignable = targetPermissions.filter(
      (permission) => !actorHasWildcard && !actorPermissions.includes(permission)
    );
    if (unassignable.length) {
      return res.status(403).json({
        success: false,
        code: "ROLE_ASSIGN_FORBIDDEN",
        message: "Không thể gán vai trò có quyền cao hơn quyền của bạn",
      });
    }
    // Never let the last admin be demoted; that would lock everyone out.
    if (dbRole !== "admin") {
      const target = await User.findById(req.params.id).select("role");
      if (!target) {
        return res.status(404).json({ success: false, message: "Không tìm thấy user" });
      }
      if (target.role === "admin" && (await User.countDocuments({ role: "admin" })) <= 1) {
        return res.status(400).json({
          success: false,
          code: "LAST_ADMIN",
          message: "Không thể hạ quyền admin cuối cùng của hệ thống",
        });
      }
    }

    // "before" returns the pre-update document, which is what the audit entry
    // needs; the response is built from the values we already know we set.
    const previous = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role: dbRole }, $inc: { tokenVersion: 1 } },
      { returnDocument: "before" }
    );
    if (!previous) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });
    }
    const user = { ...previous.toObject(), role: dbRole };
    await revokeAllSessions(previous._id);

    // Role changes hand out or take away privilege, so they belong on the same
    // trail as account locks. UI role names are logged, not the DB alias.
    await auditLogService.record({
      action: auditLogService.ACTIONS.USER_ROLE_CHANGE,
      actor: req.user,
      req,
      targetType: "User",
      targetId: previous._id,
      targetLabel: previous.email || previous.name || String(previous._id),
      changes: auditLogService.diffFields(
        { role: toUiRole(previous.role) },
        { role: toUiRole(dbRole) },
        { role: FIELD_LABELS.role }
      ),
    });

    res.json({
      success: true,
      data: { user: serialize(user, {}, await roleRegistry.roleLabels()) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PATCH /api/admin/users/:id/status  { status: 'active' | 'banned' }
router.patch("/:id/status", requirePermission("user.manage"), async (req, res) => {
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

    const previous = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { status }, $inc: { tokenVersion: 1 } },
      { returnDocument: "before" }
    );
    if (!previous) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });
    }
    const user = { ...previous.toObject(), status };
    await revokeAllSessions(previous._id);

    // Locking an account cuts a customer off from their orders; whoever did it
    // has to be identifiable afterwards.
    await auditLogService.record({
      action: auditLogService.ACTIONS.USER_STATUS_CHANGE,
      actor: req.user,
      req,
      targetType: "User",
      targetId: previous._id,
      targetLabel: previous.email || previous.name || String(previous._id),
      changes: auditLogService.diffFields(
        { status: previous.status },
        { status },
        { status: FIELD_LABELS.status }
      ),
      reason: String(req.body?.reason || "").trim(),
    });

    res.json({
      success: true,
      data: { user: serialize(user, {}, await roleRegistry.roleLabels()) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// DELETE /api/admin/users/:id
router.delete("/:id", requirePermission("user.manage"), async (req, res, next) => {
  try {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Không thể xoá chính mình",
      });
    }
    const [orderCount, reviewCount, postCount] = await Promise.all([
      Order.countDocuments({ user: req.params.id }),
      Review.countDocuments({ user: req.params.id }),
      Post.countDocuments({ author: req.params.id }),
    ]);
    if (orderCount > 0 || reviewCount > 0 || postCount > 0) {
      return res.status(400).json({
        success: false,
        message: "User da co lich su don hang, danh gia hoac bai viet; hay khoa tai khoan thay vi xoa",
      });
    }

    const session = await mongoose.startSession();
    let user;
    try {
      await session.withTransaction(async () => {
        const orders = await Order.countDocuments({ user: req.params.id }).session(
          session
        );
        const reviews = await Review.countDocuments({ user: req.params.id }).session(
          session
        );
        const posts = await Post.countDocuments({ author: req.params.id }).session(
          session
        );
        if (orders > 0 || reviews > 0 || posts > 0) {
          const error = new Error(
            "User da co lich su don hang, danh gia hoac bai viet; hay khoa tai khoan thay vi xoa"
          );
          error.statusCode = 400;
          throw error;
        }

        user = await User.findByIdAndDelete(req.params.id, { session });
        if (!user) return;
        const conversationIds = (
          await Conversation.find({ user: user._id }).select("_id").session(session)
        ).map((conversation) => conversation._id);

        await Cart.deleteMany({ user: user._id }, { session });
        await AuthSession.deleteMany({ user: user._id }, { session });
        await Message.deleteMany(
          { conversation: { $in: conversationIds } },
          { session }
        );
        await Conversation.deleteMany({ user: user._id }, { session });
        await Notification.deleteMany({ user: user._id }, { session });
        await PromotionAlertDelivery.deleteMany(
          { user: user._id },
          { session }
        );
        await Notification.updateMany(
          { readBy: user._id },
          { $pull: { readBy: user._id } },
          { session }
        );
        await AnalyticsEvent.updateMany(
          { user: user._id },
          { $set: { user: null } },
          { session }
        );
        await VoucherRedemption.deleteMany({ user: user._id }, { session });
      });
    } finally {
      await session.endSession();
    }
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });
    }
    res.json({ success: true, message: "Đã xoá" });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
});

module.exports = router;
