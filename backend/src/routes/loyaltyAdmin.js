const express = require("express");
const LoyaltyProgram = require("../models/LoyaltyProgram");
const LoyaltyGift = require("../models/LoyaltyGift");
const LoyaltyGiftRedemption = require("../models/LoyaltyGiftRedemption");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const loyaltyService = require("../services/loyaltyService");
const auditLogService = require("../services/auditLogService");
const { auth, requirePermission } = require("../middleware/auth");
const { parsePositiveInt, safeRegex } = require("../utils/security");

const router = express.Router();

// Reading the programme is the baseline; writing and adjusting are separate
// grants, applied per route below.
router.use(auth, requirePermission("loyalty.read"));

const serialize = (doc) => ({ ...doc.toObject(), id: doc._id });

function fail(res, error, fallback = "Lỗi server") {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: status === 500 ? fallback : error.message,
    code: error.code,
  });
}

// ──────────────────────────────────────────────────────────────
// Programme configuration
// ──────────────────────────────────────────────────────────────

router.get("/program", async (_req, res) => {
  try {
    const config = await LoyaltyProgram.getConfig({ bypassCache: true });
    res.json({ success: true, data: { program: config } });
  } catch (error) {
    fail(res, error);
  }
});

const PROGRAM_FIELDS = [
  "enabled",
  "earnRate",
  "earnHoldDays",
  "redeemEnabled",
  "redeemRate",
  "redeemMinPoints",
  "redeemMaxPercent",
  "redeemStep",
  "tiers",
  "tierWindowDays",
  "tierGraceDays",
  "expiryEnabled",
  "expiryDays",
];

router.put(
  "/program",
  requirePermission("loyalty.manage"),
  async (req, res) => {
    try {
      const before = await LoyaltyProgram.getConfig({ bypassCache: true });
      const patch = {};
      for (const field of PROGRAM_FIELDS) {
        if (req.body?.[field] !== undefined) patch[field] = req.body[field];
      }
      patch.updatedBy = req.user._id;

      const doc = await LoyaltyProgram.findOne({ key: "default" });
      doc.set(patch);
      await doc.save();
      LoyaltyProgram.invalidateCache();

      // Audit after the write lands, never inside it.
      const changes = auditLogService.diffFields(before, doc.toObject(), {
        enabled: "Bật chương trình",
        earnRate: "Tỉ lệ tích điểm",
        redeemRate: "Tỉ lệ quy đổi điểm",
        redeemMaxPercent: "Trần dùng điểm (%)",
        redeemMinPoints: "Điểm tối thiểu mỗi lần dùng",
        redeemStep: "Bội số điểm",
        tierWindowDays: "Cửa sổ xét hạng (ngày)",
        tierGraceDays: "Thời gian ân hạn (ngày)",
      });
      if (changes.length > 0) {
        await auditLogService
          .record({
            action: AuditLog.ACTIONS.LOYALTY_PROGRAM_UPDATE,
            actor: req.user,
            req,
            targetType: "LoyaltyProgram",
            targetId: doc._id,
            targetLabel: "Chương trình điểm thưởng",
            changes,
          })
          .catch(() => null);
      }

      res.json({
        success: true,
        message: "Đã lưu cấu hình chương trình",
        data: { program: doc.toObject() },
      });
    } catch (error) {
      if (error.name === "ValidationError") {
        return res.status(422).json({
          success: false,
          message: Object.values(error.errors)[0]?.message || "Cấu hình không hợp lệ",
        });
      }
      fail(res, error);
    }
  }
);

// ──────────────────────────────────────────────────────────────
// Members and their ledgers
// ──────────────────────────────────────────────────────────────

router.get("/members", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const result = await loyaltyService.listMembers({
      search: String(req.query.search || "").trim(),
      tierKey: String(req.query.tierKey || "").trim().toLowerCase(),
      page,
      limit,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    fail(res, error);
  }
});

router.get("/members/:userId", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const detail = await loyaltyService.getMemberDetail(req.params.userId, {
      page,
      limit,
    });
    res.json({ success: true, data: detail });
  } catch (error) {
    fail(res, error);
  }
});

router.post(
  "/members/:userId/adjust",
  requirePermission("loyalty.adjust"),
  async (req, res) => {
    try {
      const { points, reason } = req.body || {};
      const customer = await User.findById(req.params.userId)
        .select("name email")
        .lean();
      if (!customer) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy người dùng" });
      }

      const { ledger, balance } = await loyaltyService.adjustPoints({
        userId: req.params.userId,
        points,
        reason,
        performedBy: req.user._id,
      });

      await auditLogService
        .record({
          action: AuditLog.ACTIONS.LOYALTY_POINTS_ADJUST,
          actor: req.user,
          req,
          targetType: "User",
          targetId: customer._id,
          targetLabel: `${customer.name} <${customer.email}>`,
          changes: [
            {
              field: "pointsBalance",
              label: "Số dư điểm",
              before: String(ledger.balanceBefore),
              after: String(ledger.balanceAfter),
            },
          ],
          reason: String(reason || "").trim(),
        })
        .catch(() => null);

      res.json({
        success: true,
        message: "Đã điều chỉnh điểm",
        data: { balance, ledger },
      });
    } catch (error) {
      fail(res, error, "Không điều chỉnh được điểm");
    }
  }
);

router.post(
  "/members/:userId/recalc-tier",
  requirePermission("loyalty.manage"),
  async (req, res) => {
    try {
      const result = await loyaltyService.recalcTier(req.params.userId);
      res.json({ success: true, message: "Đã xét lại hạng", data: result });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get("/ledger", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = {};
    if (req.query.user) filter.user = req.query.user;
    if (req.query.type && LoyaltyLedger.MOVEMENT_TYPES.includes(req.query.type)) {
      filter.type = req.query.type;
    }

    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      LoyaltyLedger.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email")
        .populate("performedBy", "name email")
        .lean(),
      LoyaltyLedger.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        entries: entries.map((entry) => ({ ...entry, id: entry._id })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    fail(res, error);
  }
});

// ──────────────────────────────────────────────────────────────
// Gift catalogue
// ──────────────────────────────────────────────────────────────

const GIFT_FIELDS = [
  "code",
  "name",
  "description",
  "imageUrl",
  "pointsCost",
  "minTierKey",
  "voucherTemplate",
  "stock",
  "perUserLimit",
  "active",
  "startAt",
  "endAt",
  "sortOrder",
];

function pickGiftPayload(body = {}) {
  const payload = {};
  for (const field of GIFT_FIELDS) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  return payload;
}

router.get("/gifts", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = {};
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;
    const search = String(req.query.q || "").trim();
    if (search) {
      const pattern = safeRegex(search);
      if (pattern) filter.$or = [{ name: pattern }, { code: pattern }];
    }

    const skip = (page - 1) * limit;
    const [gifts, total] = await Promise.all([
      LoyaltyGift.find(filter)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LoyaltyGift.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        gifts: gifts.map((gift) => ({ ...gift, id: gift._id })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/gifts", requirePermission("loyalty.manage"), async (req, res) => {
  try {
    const gift = await LoyaltyGift.create(pickGiftPayload(req.body));
    await auditLogService
      .record({
        action: AuditLog.ACTIONS.LOYALTY_GIFT_UPDATE,
        actor: req.user,
        req,
        targetType: "LoyaltyGift",
        targetId: gift._id,
        targetLabel: gift.name,
        changes: [
          {
            field: "pointsCost",
            label: "Điểm cần đổi",
            before: "",
            after: String(gift.pointsCost),
          },
        ],
      })
      .catch(() => null);
    res
      .status(201)
      .json({ success: true, message: "Đã tạo quà", data: { gift: serialize(gift) } });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Mã quà đã tồn tại" });
    }
    if (error.name === "ValidationError") {
      return res.status(422).json({
        success: false,
        message: Object.values(error.errors)[0]?.message || "Dữ liệu không hợp lệ",
      });
    }
    fail(res, error);
  }
});

router.put("/gifts/:id", requirePermission("loyalty.manage"), async (req, res) => {
  try {
    const gift = await LoyaltyGift.findById(req.params.id);
    if (!gift) {
      return res.status(404).json({ success: false, message: "Không tìm thấy quà" });
    }
    const before = gift.toObject();
    gift.set(pickGiftPayload(req.body));
    await gift.save();

    const changes = auditLogService.diffFields(before, gift.toObject(), {
      pointsCost: "Điểm cần đổi",
      active: "Đang bật",
      stock: "Số lượng",
    });
    if (changes.length > 0) {
      await auditLogService
        .record({
          action: AuditLog.ACTIONS.LOYALTY_GIFT_UPDATE,
          actor: req.user,
          req,
          targetType: "LoyaltyGift",
          targetId: gift._id,
          targetLabel: gift.name,
          changes,
        })
        .catch(() => null);
    }

    res.json({ success: true, message: "Đã lưu quà", data: { gift: serialize(gift) } });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(422).json({
        success: false,
        message: Object.values(error.errors)[0]?.message || "Dữ liệu không hợp lệ",
      });
    }
    fail(res, error);
  }
});

router.delete(
  "/gifts/:id",
  requirePermission("loyalty.manage"),
  async (req, res) => {
    try {
      const gift = await LoyaltyGift.findById(req.params.id);
      if (!gift) {
        return res.status(404).json({ success: false, message: "Không tìm thấy quà" });
      }

      // A gift somebody has already redeemed stays on file: deleting it would
      // orphan their redemption record and the voucher it explains.
      if (gift.issuedCount > 0) {
        gift.active = false;
        await gift.save();
        return res.json({
          success: true,
          message: "Quà đã có người đổi nên chỉ được tắt, không xoá",
          data: { gift: serialize(gift), deactivated: true },
        });
      }

      await LoyaltyGift.deleteOne({ _id: gift._id });
      res.json({ success: true, message: "Đã xoá quà", data: { deleted: true } });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get("/gifts/:id/redemptions", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const skip = (page - 1) * limit;
    const filter = { gift: req.params.id };

    const [redemptions, total] = await Promise.all([
      LoyaltyGiftRedemption.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email")
        .lean(),
      LoyaltyGiftRedemption.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        redemptions: redemptions.map((row) => ({ ...row, id: row._id })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    fail(res, error);
  }
});

// ──────────────────────────────────────────────────────────────
// Health of the programme
// ──────────────────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  try {
    const stats = await loyaltyService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    fail(res, error);
  }
});

router.get("/reconcile", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 50, 500);
    const drifts = await loyaltyService.reconcileBalances({ limit });
    res.json({ success: true, data: { drifts } });
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
