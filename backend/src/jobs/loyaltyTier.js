const mongoose = require("mongoose");
const User = require("../models/User");
const loyaltyService = require("../services/loyaltyService");
const notificationService = require("../services/notificationService");

// The job wakes hourly but only touches customers whose tier is stale, so the
// interval is about responsiveness rather than volume: a customer promoted by
// this morning's delivery sees it within the hour rather than at midnight.
const POLL_INTERVAL_MS = 60 * 60 * 1000;
const RE_EVALUATE_AFTER_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;
const START_DELAY_MS = 30 * 1000;

let timer = null;
let tickRunning = false;

function notifySafe(userId, payload) {
  return notificationService.notifyUser(userId, payload).catch(() => null);
}

async function announceTierChange(userId, { from, to, config }) {
  const toTier = loyaltyService.resolveTierByKey(to, config);
  const fromTier = from ? loyaltyService.resolveTierByKey(from, config) : null;
  if (!toTier) return;

  const promoted =
    !fromTier || Number(toTier.threshold) > Number(fromTier.threshold);

  await notifySafe(userId, {
    type: "loyalty",
    title: promoted
      ? `Chúc mừng bạn lên hạng ${toTier.label}`
      : `Hạng thành viên đổi thành ${toTier.label}`,
    message: promoted
      ? `Từ giờ mỗi đơn hàng của bạn tích điểm nhân ${toTier.multiplier}.`
      : `Chi tiêu 12 tháng gần nhất chưa đạt ngưỡng hạng cũ. Hạng hiện tại của bạn là ${toTier.label}.`,
    link: "/profile/points",
    metadata: { from, to },
  });
}

/**
 * Evaluate one batch of the least recently judged customers.
 *
 * Candidates are picked by staleness rather than by activity: a customer who
 * stops buying still needs re-judging, and that is exactly the case a
 * "recalculate on order" hook would miss.
 */
async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    if (mongoose.connection.readyState !== 1) return;

    const config = await loyaltyService.getConfig();
    if (!config.enabled) return;

    const staleBefore = new Date(Date.now() - RE_EVALUATE_AFTER_MS);
    const candidates = await User.find({
      status: "active",
      $or: [
        { "loyalty.tierEvaluatedAt": null },
        { "loyalty.tierEvaluatedAt": { $lte: staleBefore } },
      ],
    })
      .select("_id")
      // Ascending puts never-evaluated customers (null) first, which is where
      // the ladder matters most: they have no tier at all yet.
      .sort({ "loyalty.tierEvaluatedAt": 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (candidates.length === 0) return;

    const ids = candidates.map((row) => row._id);
    const spendByUser = await loyaltyService.computeSpendWindowBatch(
      ids,
      config.tierWindowDays
    );

    let changed = 0;
    for (const id of ids) {
      try {
        const result = await loyaltyService.recalcTier(id, {
          spend: spendByUser.get(String(id)) || 0,
        });
        if (result.changed) {
          changed += 1;
          await announceTierChange(id, { ...result, config });
        }
      } catch (error) {
        // One customer's write conflict must not stall the batch; the next
        // tick picks them up again because their timestamp did not move.
        if (!/write conflict|transienttransactionerror/i.test(error.message)) {
          console.error(`[loyaltyTier] Failed for user ${id}:`, error.message);
        }
      }
    }

    if (changed > 0) {
      console.log(
        `[loyaltyTier] Evaluated ${ids.length} customer(s), ${changed} tier change(s)`
      );
    }
  } catch (error) {
    console.error("[loyaltyTier] Tick error:", error);
  } finally {
    tickRunning = false;
  }
}

/**
 * Report customers whose cached balance disagrees with their ledger. Never
 * repairs: a drift means something wrote to pointsBalance outside
 * applyPointsMovement, and that needs a person, not an automatic patch.
 */
async function reportDrift() {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const drifts = await loyaltyService.reconcileBalances({ limit: 20 });
    if (drifts.length > 0) {
      console.error(
        `[loyaltyTier] ${drifts.length} customer(s) have a points balance that does not match their ledger:`,
        drifts
          .map((row) => `${row.email} (số dư ${row.balance}, sổ ${row.ledgerTotal})`)
          .join(", ")
      );
    }
  } catch (error) {
    console.error("[loyaltyTier] Drift check failed:", error.message);
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, POLL_INTERVAL_MS);
  // Delay the first pass so startup migrations and index syncs finish first.
  setTimeout(() => {
    tick();
    reportDrift();
  }, START_DELAY_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, reportDrift };
